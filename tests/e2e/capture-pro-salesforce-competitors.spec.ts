import { expect, test, type Page, type Route } from '@playwright/test';
import type { MenuNode, SalesforceCompetitorSummary, SalesforceSyncRun } from '@platform/shared';
import { organisation, setupAuthenticatedApp, user } from './support/app';

const competitorsRoute = '/app/product/Capture-Pro/competitors';
const node = (id: string, name: string, route: string | null, children: MenuNode[] = []): MenuNode => ({
  id, parentId: null, name, route, icon: 'cloud', type: 'Secured', productId: 'product-capture-pro', displayOrder: 1,
  isActive: true, accessMode: 'readonly', children,
});
const menus = [node('capture-pro', 'Capture-Pro', null, [node('salesforce', 'Salesforce', null, [node('salesforce-competitors', 'Competitors', competitorsRoute)])])];
const lastSync: SalesforceSyncRun = {
  id: 'run-1', status: 'Succeeded', startedAt: '2026-10-20T01:00:00.000Z', completedAt: '2026-10-20T01:00:20.000Z',
  receivedCount: 3, matchedCount: 3, insertedCount: 3, updatedCount: 0, removedCount: 0, errorMessage: null,
};
const competitor = (index: number, fields: SalesforceCompetitorSummary['fields'] = {}, overrides: Partial<SalesforceCompetitorSummary> = {}): SalesforceCompetitorSummary => ({
  id: `competitor-${index}`, salesforceId: `a0X${String(index).padStart(15, '0')}`,
  fields: {
    Id: `a0X${String(index).padStart(15, '0')}`, Competitor_Name__c: `Competitor ${String(index).padStart(3, '0')}`, Competitor__c: null,
    Opportunity__c: null, Won__c: false, Competitor_s_Bid_Price__c: null, Competitor_Vessel__c: null, Competitor_Yard__c: null, Comments__c: null, ...fields,
  },
  competitorAccountId: null, competitorAccountName: null, opportunitySalesforceId: null, opportunityNumber: null, opportunityName: null,
  inExtract: true, lastSeenAt: '2026-10-20T01:00:20.000Z', removedFromExtractAt: null, ...overrides,
});
const current = [
  competitor(1, { Competitor_Name__c: 'Saipem', Competitor__c: '001000000000000001', Opportunity__c: '006000000000000001', Won__c: true, Competitor_s_Bid_Price__c: 125000000, Competitor_Vessel__c: 'Castorone', Comments__c: 'Lowest technically compliant bid' }, {
    competitorAccountId: '001000000000000001', competitorAccountName: 'Saipem SpA', opportunitySalesforceId: '006000000000000001', opportunityNumber: 'OPP-1001', opportunityName: 'Hess Subsea Tieback',
  }),
  competitor(2, { Competitor_Name__c: 'TechnipFMC', Competitor__c: '001000000000000002', Opportunity__c: '006000000000000099', Won__c: false, Competitor_s_Bid_Price__c: 98000000, Competitor_Yard__c: 'Batam' }, {
    competitorAccountId: '001000000000000002', competitorAccountName: null, opportunitySalesforceId: '006000000000000099',
  }),
  competitor(3, { Competitor_Name__c: 'Subsea 7', Won__c: false }),
];
const removed = competitor(4, { Competitor_Name__c: 'Retired Contractor' }, { inExtract: false, removedFromExtractAt: '2026-10-20T01:00:20.000Z' });
const rows = (page: Page) => page.locator('tbody tr');

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function signIn(page: Page, globalRoles: string[]) {
  await setupAuthenticatedApp(page, { currentUser: { ...user, globalRoles }, menus });
  await page.route('**/api/organisations/mine', (route) => json(route, [{ ...organisation, membership: 'Member' }]));
}

async function mockCompetitors(page: Page, list = current, requests: string[] = []) {
  await page.route(/\/salesforce-competitors\?/, (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    expect(url.searchParams.get('orgId')).toBe(organisation.id);
    return json(route, { lastSync, competitors: url.searchParams.get('includeRemoved') === 'true' ? [...list, removed] : list });
  });
}

test('an analyst opens Competitors from the Salesforce menu and sees linked names with Salesforce ID fallbacks', async ({ page }) => {
  await signIn(page, ['Capture-Pro Analyst']);
  await mockCompetitors(page);
  await page.goto('/app/products');
  await page.getByRole('link', { name: 'Competitors', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${competitorsRoute}$`));
  await expect(page.getByRole('heading', { name: 'Salesforce Competitors' })).toBeVisible();
  await expect(page.getByTestId('salesforce-data-source')).toHaveText('Data source: Salesforce· Project_Competitor_Details__c');
  await expect(rows(page)).toHaveCount(3);
  const saipem = rows(page).filter({ hasText: 'Saipem' });
  await expect(saipem).toContainText('Saipem SpA');
  await expect(saipem).toContainText('OPP-1001 · Hess Subsea Tieback');
  await expect(saipem).toContainText('Yes');
  await expect(saipem).toContainText('125,000,000');
  const technip = rows(page).filter({ hasText: 'TechnipFMC' });
  await expect(technip).toContainText('001000000000000002');
  await expect(technip).toContainText('006000000000000099');
});

test('competitors can be filtered by Won, bid price, and text and can include removed records', async ({ page }) => {
  await signIn(page, ['Capture-Pro Manager']);
  const requests: string[] = [];
  await mockCompetitors(page, current, requests);
  await page.goto(competitorsRoute);
  await expect(rows(page)).toHaveCount(3);

  await page.getByLabel('Filter Won', { exact: true }).selectOption('true');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Saipem');
  await page.getByLabel('Filter Won', { exact: true }).selectOption('');
  await page.getByLabel("Filter Competitor's Bid Price", { exact: true }).fill('<100,000,000');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('TechnipFMC');
  await page.getByLabel("Filter Competitor's Bid Price", { exact: true }).fill('');
  await page.getByLabel('Filter Comments', { exact: true }).fill('compliant');
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Clear filters (1)' }).click();
  await page.getByLabel('Search Salesforce competitors').fill('batam');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('TechnipFMC');
  await page.getByLabel('Search Salesforce competitors').fill('');

  await page.getByLabel('Show records no longer in Salesforce').check();
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).filter({ hasText: 'Retired Contractor' })).toContainText('Not in latest extract');
  expect(requests.some((search) => search.includes('includeRemoved=true'))).toBe(true);
});

test('the details panel shows every Salesforce competitor field with linked records', async ({ page }) => {
  await signIn(page, ['Capture-Pro Module Administrator']);
  await mockCompetitors(page);
  await page.goto(competitorsRoute);
  await page.getByRole('button', { name: 'View details for Saipem' }).click();
  const panel = page.getByRole('dialog', { name: 'Saipem' });
  await expect(panel).toBeVisible();
  for (const apiName of ['Competitor_Name__c', 'Competitor__c', 'Opportunity__c', 'Won__c', 'Competitor_s_Bid_Price__c', 'Competitor_Vessel__c', 'Competitor_Yard__c', 'Comments__c']) {
    await expect(panel).toContainText(apiName);
  }
  await expect(panel).toContainText('Saipem SpA');
  await expect(panel).toContainText('OPP-1001 · Hess Subsea Tieback');
  await expect(panel).toContainText('Castorone');
  await expect(panel.getByRole('button', { name: 'Close competitor details' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('large competitor lists are paginated inside a table that fits the page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, ['Capture-Pro Analyst']);
  await mockCompetitors(page, Array.from({ length: 150 }, (_, index) => competitor(index + 10)));
  await page.goto(competitorsRoute);
  await expect(rows(page)).toHaveCount(100);
  await expect(page.getByText('Showing 1–100 of 150 competitor records')).toBeVisible();
  const metrics = await page.getByTestId('salesforce-competitors-scroll').evaluate((element) => {
    const main = element.closest('main')!;
    return { bottom: element.getBoundingClientRect().bottom, mainBottom: main.getBoundingClientRect().bottom, mainScrolls: main.scrollHeight > main.clientHeight + 1 };
  });
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.mainBottom);
  expect(metrics.mainScrolls).toBe(false);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(rows(page)).toHaveCount(50);
});

test('shows an empty state with a link to Sync & Health before the first competitor sync', async ({ page }) => {
  await signIn(page, ['Capture-Pro Analyst']);
  await page.route(/\/salesforce-competitors\?/, (route) => json(route, { lastSync: null, competitors: [] }));
  await page.goto(competitorsRoute);
  await expect(page.getByText('No Salesforce competitors have been synchronized for this organisation.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sync competitors now' })).toHaveAttribute('href', '/app/product/Capture-Pro/salesforce-sync');
});

test('access denial is shown without rendering competitor data', async ({ page }) => {
  await signIn(page, ['General User']);
  await page.route(/\/salesforce-competitors\?/, (route) => json(route, { message: 'A Capture-Pro role is required to view Salesforce competitors' }, 403));
  await page.goto(competitorsRoute);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A Capture-Pro role is required to view Salesforce competitors');
  await expect(rows(page)).toHaveCount(0);
});
