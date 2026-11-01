import { expect, test, type Page, type Route } from '@playwright/test';
import type { MenuNode, SalesforceBidBudgetSummary, SalesforceSyncRun } from '@platform/shared';
import { organisation, setupAuthenticatedApp, user } from './support/app';

const bidBudgetsRoute = '/app/product/Capture-Pro/bid-budgets';
const node = (id: string, name: string, route: string | null, children: MenuNode[] = []): MenuNode => ({
  id, parentId: null, name, route, icon: 'cloud', type: 'Secured', productId: 'product-capture-pro', displayOrder: 1,
  isActive: true, accessMode: 'readonly', children,
});
const menus = [node('capture-pro', 'Capture-Pro', null, [node('salesforce', 'Salesforce', null, [node('salesforce-bid-budgets', 'Bid Budget Data', bidBudgetsRoute)])])];
const lastSync: SalesforceSyncRun = {
  id: 'run-1', status: 'Succeeded', startedAt: '2026-10-20T01:00:00.000Z', completedAt: '2026-10-20T01:00:20.000Z',
  receivedCount: 3, matchedCount: 3, insertedCount: 3, updatedCount: 0, removedCount: 0, errorMessage: null,
};
const bidBudget = (index: number, fields: SalesforceBidBudgetSummary['fields'] = {}, overrides: Partial<SalesforceBidBudgetSummary> = {}): SalesforceBidBudgetSummary => ({
  id: `bid-budget-${index}`, salesforceId: `a0C${String(index).padStart(15, '0')}`,
  fields: {
    Id: `a0C${String(index).padStart(15, '0')}`, Opportunity__c: '006000000000000001', Actual_Bid_Cost__c: null, Compensation__c: null,
    Opportunity_Bid_Budget_Recovery_Year__c: '2026', Budgeted_Hours__c: null, Forecasted_Spend__c: null, Actual_Bid_Budget__c: null,
    Additional_Pre_Contract_1__c: null, Additional_Pre_Contract_2__c: null, Additional_Pre_Contract_3__c: null, Forecast_Purpose__c: null,
    PG1_Pre_Contract__c: null, ...fields,
  },
  opportunitySalesforceId: '006000000000000001', opportunityNumber: null, opportunityName: null,
  inExtract: true, lastSeenAt: '2026-10-20T01:00:20.000Z', removedFromExtractAt: null, ...overrides,
});
const linked = { opportunityNumber: 'OPP-1001', opportunityName: 'Hess Subsea Tieback' };
const current = [
  bidBudget(1, { Forecast_Purpose__c: 250000, Actual_Bid_Cost__c: 1250000, Actual_Bid_Budget__c: 1500000, Budgeted_Hours__c: 8200, PG1_Pre_Contract__c: 75000 }, linked),
  bidBudget(2, { Forecast_Purpose__c: 0, Actual_Bid_Cost__c: 450000, Actual_Bid_Budget__c: 600000, Opportunity_Bid_Budget_Recovery_Year__c: '2027', PG1_Pre_Contract__c: 0 }, linked),
  bidBudget(3, { Opportunity__c: '006000000000000099', Forecast_Purpose__c: 0, Actual_Bid_Cost__c: 2000000, Actual_Bid_Budget__c: 2100000 }, { opportunitySalesforceId: '006000000000000099' }),
];
const removed = bidBudget(4, { Actual_Bid_Budget__c: 9999 }, { inExtract: false, removedFromExtractAt: '2026-10-20T01:00:20.000Z' });
const rows = (page: Page) => page.locator('tbody tr');

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function signIn(page: Page, globalRoles: string[]) {
  await setupAuthenticatedApp(page, { currentUser: { ...user, globalRoles }, menus });
  await page.route('**/api/organisations/mine', (route) => json(route, [{ ...organisation, membership: 'Member' }]));
}

async function mockBidBudgets(page: Page, list = current, requests: string[] = []) {
  await page.route(/\/salesforce-bid-budgets\?/, (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    expect(url.searchParams.get('orgId')).toBe(organisation.id);
    return json(route, { lastSync, bidBudgets: url.searchParams.get('includeRemoved') === 'true' ? [...list, removed] : list });
  });
}

test('an analyst opens Bid Budget Data from the Salesforce menu and sees linked opportunities with Salesforce ID fallbacks', async ({ page }) => {
  await signIn(page, ['Capture-Pro Analyst']);
  await mockBidBudgets(page);
  await page.goto('/app/products');
  await page.getByRole('link', { name: 'Bid Budget Data', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${bidBudgetsRoute}$`));
  await expect(page.getByRole('heading', { name: 'Bid Budget Data', level: 1 })).toBeVisible();
  await expect(page.getByTestId('salesforce-data-source')).toHaveText('Data source: Salesforce· Opportunity_Bid_Budget__c');
  await expect(rows(page)).toHaveCount(3);
  await expect(rows(page).filter({ hasText: 'OPP-1001 · Hess Subsea Tieback' })).toHaveCount(2);
  const first = rows(page).filter({ hasText: '1,250,000' });
  await expect(first).toContainText('8,200');
  await expect(first).toContainText('75,000');
  await expect(first).toContainText('250,000');
  await expect(rows(page).filter({ hasText: '2,000,000' })).toContainText('006000000000000099');
});

test('bid budgets can be filtered by numeric amounts, recovery year, and blanks and can include removed records', async ({ page }) => {
  await signIn(page, ['Capture-Pro Manager']);
  const requests: string[] = [];
  await mockBidBudgets(page, current, requests);
  await page.goto(bidBudgetsRoute);
  await expect(rows(page)).toHaveCount(3);

  await page.getByLabel('Filter Forecast Purpose', { exact: true }).fill('0');
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel('Filter Actual Bid Cost', { exact: true }).fill('>1,000,000');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('006000000000000099');
  await page.getByRole('button', { name: 'Clear filters (2)' }).click();
  await page.getByLabel('Filter Recovery Year', { exact: true }).selectOption('2027');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('600,000');
  await page.getByLabel('Filter Recovery Year', { exact: true }).selectOption('');
  await page.getByLabel('Filter PG1 Pre-Contract', { exact: true }).fill('>0');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('1,250,000');
  await page.getByLabel('Filter PG1 Pre-Contract', { exact: true }).fill('');
  await page.getByLabel('Filter Actual Bid Budget', { exact: true }).fill('1000000..2000000');
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel('Filter Actual Bid Budget', { exact: true }).fill('');
  await page.getByLabel('Search Salesforce bid budget data').fill('opp-1001');
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel('Search Salesforce bid budget data').fill('');

  await page.getByLabel('Show records no longer in Salesforce').check();
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).filter({ hasText: '9,999' })).toContainText('Not in latest extract');
  expect(requests.some((search) => search.includes('includeRemoved=true'))).toBe(true);
});

test('the details panel shows every Salesforce bid budget field with the linked opportunity', async ({ page }) => {
  await signIn(page, ['Capture-Pro Module Administrator']);
  await mockBidBudgets(page);
  await page.goto(bidBudgetsRoute);
  await page.getByRole('button', { name: `View details for bid budget ${current[0].salesforceId}` }).click();
  const panel = page.getByRole('dialog', { name: 'OPP-1001 · Hess Subsea Tieback' });
  await expect(panel).toBeVisible();
  for (const apiName of [
    'Opportunity__c', 'Actual_Bid_Cost__c', 'Compensation__c', 'Opportunity_Bid_Budget_Recovery_Year__c', 'Budgeted_Hours__c', 'Forecasted_Spend__c',
    'Actual_Bid_Budget__c', 'Additional_Pre_Contract_1__c', 'Additional_Pre_Contract_2__c', 'Additional_Pre_Contract_3__c', 'Forecast_Purpose__c', 'PG1_Pre_Contract__c',
  ]) {
    await expect(panel).toContainText(apiName);
  }
  await expect(panel).toContainText('1,500,000');
  await expect(panel.getByRole('button', { name: 'Close bid budget details' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('large bid budget lists are paginated inside a table that fits the page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, ['Capture-Pro Analyst']);
  await mockBidBudgets(page, Array.from({ length: 120 }, (_, index) => bidBudget(index + 10, { Actual_Bid_Cost__c: index * 1000 })));
  await page.goto(bidBudgetsRoute);
  await expect(rows(page)).toHaveCount(100);
  await expect(page.getByText('Showing 1–100 of 120 bid budget records')).toBeVisible();
  const metrics = await page.getByTestId('salesforce-bid-budgets-scroll').evaluate((element) => {
    const main = element.closest('main')!;
    return { bottom: element.getBoundingClientRect().bottom, mainBottom: main.getBoundingClientRect().bottom, mainScrolls: main.scrollHeight > main.clientHeight + 1 };
  });
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.mainBottom);
  expect(metrics.mainScrolls).toBe(false);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(rows(page)).toHaveCount(20);
});

test('shows an empty state with a link to Sync & Health before the first bid budget sync', async ({ page }) => {
  await signIn(page, ['Capture-Pro Analyst']);
  await page.route(/\/salesforce-bid-budgets\?/, (route) => json(route, { lastSync: null, bidBudgets: [] }));
  await page.goto(bidBudgetsRoute);
  await expect(page.getByText('No Salesforce bid budget data has been synchronized for this organisation.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sync bid budgets now' })).toHaveAttribute('href', '/app/product/Capture-Pro/salesforce-sync');
});

test('access denial is shown without rendering bid budget data', async ({ page }) => {
  await signIn(page, ['General User']);
  await page.route(/\/salesforce-bid-budgets\?/, (route) => json(route, { message: 'A Capture-Pro role is required to view Salesforce bid budget data' }, 403));
  await page.goto(bidBudgetsRoute);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A Capture-Pro role is required to view Salesforce bid budget data');
  await expect(rows(page)).toHaveCount(0);
});
