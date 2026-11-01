import { expect, test, type Page, type Route } from '@playwright/test';
import type { MenuNode, SalesforceAccountSummary, SalesforceSyncRun } from '@platform/shared';
import { organisation, setupAuthenticatedApp, user } from './support/app';

const accountsRoute = '/app/product/Capture-Pro/accounts';
const node = (id: string, name: string, route: string | null, children: MenuNode[] = []): MenuNode => ({
  id, parentId: null, name, route, icon: 'cloud', type: 'Secured', productId: 'product-capture-pro', displayOrder: 1,
  isActive: true, accessMode: 'readonly', children,
});
const menus = [node('capture-pro', 'Capture-Pro', null, [node('salesforce', 'Salesforce', null, [node('salesforce-accounts', 'Accounts', accountsRoute)])])];
const lastSync: SalesforceSyncRun = {
  id: 'run-1', status: 'Succeeded', startedAt: '2026-10-20T01:00:00.000Z', completedAt: '2026-10-20T01:00:20.000Z',
  receivedCount: 3, matchedCount: 3, insertedCount: 3, updatedCount: 0, removedCount: 0, errorMessage: null,
};
const account = (index: number, overrides: Partial<SalesforceAccountSummary> = {}): SalesforceAccountSummary => ({
  id: `account-${index}`, salesforceId: `001${String(index).padStart(15, '0')}`, name: `Account ${String(index).padStart(3, '0')}`,
  type: 'Customer', companyShortName: `AC${index}`, inExtract: true, lastSeenAt: '2026-10-20T01:00:20.000Z', removedFromExtractAt: null, ...overrides,
});
const current = [
  account(1, { name: 'Petronas Carigali', type: 'Customer', companyShortName: 'PCSB' }),
  account(2, { name: 'Shell Offshore', type: 'Prospect', companyShortName: null }),
  account(3, { name: 'Saipem', type: 'Competitor', companyShortName: 'SPM' }),
];
const removed = account(4, { name: 'Retired Holdings', type: null, inExtract: false, removedFromExtractAt: '2026-10-20T01:00:20.000Z' });

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function signIn(page: Page, globalRoles: string[]) {
  await setupAuthenticatedApp(page, { currentUser: { ...user, globalRoles }, menus });
  await page.route('**/api/organisations/mine', (route) => json(route, [{ ...organisation, membership: 'Member' }]));
}

async function mockAccounts(page: Page, rows = current, requests: string[] = []) {
  await page.route(/\/salesforce-accounts\?/, (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    expect(url.searchParams.get('orgId')).toBe(organisation.id);
    return json(route, { lastSync, accounts: url.searchParams.get('includeRemoved') === 'true' ? [...rows, removed] : rows });
  });
}

test('an analyst opens Accounts from the Salesforce menu and filters, searches, and includes removed accounts', async ({ page }) => {
  await signIn(page, ['Capture-Pro Analyst']);
  const requests: string[] = [];
  await mockAccounts(page, current, requests);
  await page.goto('/app/products');
  await page.getByRole('link', { name: 'Accounts', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${accountsRoute}$`));
  await expect(page.getByRole('heading', { name: 'Salesforce Accounts' })).toBeVisible();
  await expect(page.getByTestId('salesforce-data-source')).toHaveText('Data source: Salesforce· Account');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('tbody tr').filter({ hasText: 'Petronas Carigali' })).toContainText('PCSB');

  await page.getByLabel('Filter Type', { exact: true }).selectOption('Competitor');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr').first()).toContainText('Saipem');
  await page.getByLabel('Filter Type', { exact: true }).selectOption('');
  await page.getByLabel('Filter Company Short Name', { exact: true }).selectOption({ label: '(Blank)' });
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr').first()).toContainText('Shell Offshore');
  await page.getByRole('button', { name: 'Clear filters (1)' }).click();
  await page.getByLabel('Filter Account Name', { exact: true }).fill('petro');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Filter Account Name', { exact: true }).fill('');
  await page.getByLabel('Search Salesforce accounts').fill('spm');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Search Salesforce accounts').fill('');

  await page.getByLabel('Show accounts no longer in Salesforce').check();
  await expect(page.locator('tbody tr')).toHaveCount(4);
  await expect(page.locator('tbody tr').filter({ hasText: 'Retired Holdings' })).toContainText('Not in latest extract');
  expect(requests.some((search) => search.includes('includeRemoved=true'))).toBe(true);
});

test('the details panel shows the account fields and sync status', async ({ page }) => {
  await signIn(page, ['Capture-Pro Manager']);
  await mockAccounts(page);
  await page.goto(accountsRoute);
  await page.getByRole('button', { name: 'View details for Petronas Carigali' }).click();
  const panel = page.getByRole('dialog', { name: 'Petronas Carigali' });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Company_Short_Name__c');
  await expect(panel).toContainText('PCSB');
  await expect(panel).toContainText('In latest extract');
  await expect(panel.getByRole('button', { name: 'Close account details' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('large account lists are paginated inside a table that fits the page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, ['Capture-Pro Analyst']);
  await mockAccounts(page, Array.from({ length: 230 }, (_, index) => account(index + 10)));
  await page.goto(accountsRoute);
  await expect(page.locator('tbody tr')).toHaveCount(100);
  await expect(page.getByText('Showing 1–100 of 230 accounts')).toBeVisible();
  const metrics = await page.getByTestId('salesforce-accounts-scroll').evaluate((element) => {
    const main = element.closest('main')!;
    return { bottom: element.getBoundingClientRect().bottom, mainBottom: main.getBoundingClientRect().bottom, mainScrolls: main.scrollHeight > main.clientHeight + 1 };
  });
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.mainBottom);
  expect(metrics.mainScrolls).toBe(false);
  await expect(page.getByRole('button', { name: 'Next page' })).toBeInViewport();
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(30);
});

test('shows an empty state with a link to Sync & Health before the first account sync', async ({ page }) => {
  await signIn(page, ['Capture-Pro Analyst']);
  await page.route(/\/salesforce-accounts\?/, (route) => json(route, { lastSync: null, accounts: [] }));
  await page.goto(accountsRoute);
  await expect(page.getByText('No Salesforce accounts have been synchronized for this organisation.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sync accounts now' })).toHaveAttribute('href', '/app/product/Capture-Pro/salesforce-sync');
});

test('access denial is shown without rendering account data', async ({ page }) => {
  await signIn(page, ['General User']);
  await page.route(/\/salesforce-accounts\?/, (route) => json(route, { message: 'A Capture-Pro role is required to view Salesforce accounts' }, 403));
  await page.goto(accountsRoute);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A Capture-Pro role is required to view Salesforce accounts');
  await expect(page.locator('tbody tr')).toHaveCount(0);
});
