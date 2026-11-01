import { expect, test, type Page, type Route } from '@playwright/test';
import type { MenuNode, SalesforceFieldDefinition, SalesforceSyncRun, SalesforceVesselSummary } from '@platform/shared';
import { organisation, setupAuthenticatedApp, user } from './support/app';

const vesselsRoute = '/app/product/Capture-Pro/vessels';
const node = (id: string, name: string, route: string | null, children: MenuNode[] = []): MenuNode => ({
  id, parentId: null, name, route, icon: 'cloud', type: 'Secured', productId: 'product-capture-pro', displayOrder: 1,
  isActive: true, accessMode: 'readonly', children,
});
const menus = [node('capture-pro', 'Capture-Pro', null, [node('salesforce', 'Salesforce', null, [node('salesforce-vessels', 'Vessel Data', vesselsRoute)])])];
const lastSync: SalesforceSyncRun = {
  id: 'run-1', status: 'Succeeded', startedAt: '2026-10-20T01:00:00.000Z', completedAt: '2026-10-20T01:00:20.000Z',
  receivedCount: 3, matchedCount: 3, insertedCount: 3, updatedCount: 0, removedCount: 0, errorMessage: null,
};
const fieldDefinitions: SalesforceFieldDefinition[] = [
  { name: 'Id', label: 'Record ID', type: 'id' },
  { name: 'Name', label: 'Vessel Name', type: 'string' },
  { name: 'Owner_Company__c', label: 'Owner Company', type: 'reference' },
  { name: 'Vessel_Type__c', label: 'Vessel Type', type: 'picklist' },
  { name: 'Crane_Capacity__c', label: 'Crane Capacity (t)', type: 'double' },
  { name: 'DP_Capable__c', label: 'DP Capable', type: 'boolean' },
  { name: 'Remarks__c', label: 'Remarks', type: 'textarea' },
];
const vessel = (index: number, fields: SalesforceVesselSummary['fields'] = {}, overrides: Partial<SalesforceVesselSummary> = {}): SalesforceVesselSummary => {
  const name = typeof fields.Name === 'string' ? fields.Name : `Vessel ${String(index).padStart(3, '0')}`;
  return {
    id: `vessel-${index}`, salesforceId: `a0E${String(index).padStart(15, '0')}`, name,
    fields: {
      Id: `a0E${String(index).padStart(15, '0')}`, Name: name, Owner_Company__c: '001000000000000001', Vessel_Type__c: 'Pipelay',
      Crane_Capacity__c: 1000, DP_Capable__c: true, Remarks__c: null, ...fields,
    },
    inExtract: true, lastSeenAt: '2026-10-20T01:00:20.000Z', removedFromExtractAt: null, ...overrides,
  };
};
const current = [
  vessel(1, { Name: 'DLV 2000', Vessel_Type__c: 'Derrick Lay', Crane_Capacity__c: 2200, Remarks__c: 'Dry dock Q3' }),
  vessel(2, { Name: 'Amazon', Vessel_Type__c: 'Pipelay', Crane_Capacity__c: 400, DP_Capable__c: false }),
  vessel(3, { Name: 'North Ocean 105', Vessel_Type__c: 'Pipelay', Crane_Capacity__c: 300 }),
];
const removed = vessel(4, { Name: 'Retired Barge' }, { inExtract: false, removedFromExtractAt: '2026-10-20T01:00:20.000Z' });
const rows = (page: Page) => page.locator('tbody tr');

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function signIn(page: Page, globalRoles: string[]) {
  await setupAuthenticatedApp(page, { currentUser: { ...user, globalRoles }, menus });
  await page.route('**/api/organisations/mine', (route) => json(route, [{ ...organisation, membership: 'Member' }]));
}

async function mockVessels(page: Page, list = current, requests: string[] = []) {
  await page.route(/\/salesforce-vessels\?/, (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    expect(url.searchParams.get('orgId')).toBe(organisation.id);
    return json(route, { lastSync, objectName: 'Vessel__c', fieldDefinitions, vessels: url.searchParams.get('includeRemoved') === 'true' ? [...list, removed] : list });
  });
}

test('an analyst opens Vessel Data from the Salesforce menu and sees it identified as Salesforce Vessel__c data', async ({ page }) => {
  await signIn(page, ['Capture-Pro Analyst']);
  await mockVessels(page);
  await page.goto('/app/products');
  await page.getByRole('link', { name: 'Vessel Data', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${vesselsRoute}$`));
  await expect(page.getByRole('heading', { name: 'Vessel Data', level: 1 })).toBeVisible();
  await expect(page.getByTestId('salesforce-data-source')).toHaveText('Data source: Salesforce· Vessel__c');
  await expect(rows(page)).toHaveCount(3);
  await expect(page.locator('thead tr').first().locator('th')).toHaveText(['Vessel Name', 'Owner Company', 'Vessel Type', 'Crane Capacity (t)', 'DP Capable', 'Remarks', 'Record ID']);
  const dlv = rows(page).filter({ hasText: 'DLV 2000' });
  await expect(dlv).toContainText('2,200');
  await expect(dlv).toContainText('Dry dock Q3');
});

test('vessels can be filtered by Salesforce type, searched, shown with any field, and include removed records', async ({ page }) => {
  await signIn(page, ['Capture-Pro Manager']);
  const requests: string[] = [];
  await mockVessels(page, current, requests);
  await page.goto(vesselsRoute);
  await page.getByLabel('Filter Vessel Type', { exact: true }).selectOption('Pipelay');
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel('Filter Crane Capacity (t)', { exact: true }).fill('>350');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Amazon');
  await page.getByRole('button', { name: 'Clear filters (2)' }).click();
  await page.getByLabel('Filter DP Capable', { exact: true }).selectOption('false');
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel('Filter DP Capable', { exact: true }).selectOption('');
  await page.getByLabel('Search Salesforce vessels').fill('north');
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel('Search Salesforce vessels').fill('');

  await page.getByRole('button', { name: 'Columns (7/7)' }).click();
  await page.getByRole('group', { name: 'Choose vessel columns' }).getByLabel('Remarks').uncheck();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Columns (6/7)' })).toBeVisible();
  await expect(page.locator('thead tr').first()).not.toContainText('Remarks');

  await page.getByLabel('Show records no longer in Salesforce').check();
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).filter({ hasText: 'Retired Barge' })).toContainText('Not in latest extract');
  expect(requests.some((search) => search.includes('includeRemoved=true'))).toBe(true);
});

test('the vessel details panel lists every discovered field', async ({ page }) => {
  await signIn(page, ['Capture-Pro Module Administrator']);
  await mockVessels(page);
  await page.goto(vesselsRoute);
  await page.getByRole('button', { name: 'View details for DLV 2000' }).click();
  const panel = page.getByRole('dialog', { name: 'DLV 2000' });
  for (const definition of fieldDefinitions) {
    await expect(panel).toContainText(definition.label);
    await expect(panel).toContainText(definition.name);
  }
  await expect(panel.getByRole('button', { name: 'Close vessel details' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('shows an empty state with a link to Sync & Health before the first vessel sync', async ({ page }) => {
  await signIn(page, ['Capture-Pro Analyst']);
  await page.route(/\/salesforce-vessels\?/, (route) => json(route, { lastSync: null, objectName: 'Vessel__c', fieldDefinitions: [], vessels: [] }));
  await page.goto(vesselsRoute);
  await expect(page.getByText('No Salesforce vessels have been synchronized for this organisation.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sync vessels now' })).toHaveAttribute('href', '/app/product/Capture-Pro/salesforce-sync');
  await expect(page.getByTestId('salesforce-data-source')).toContainText('Vessel__c');
});

test('access denial is shown without rendering vessel data', async ({ page }) => {
  await signIn(page, ['General User']);
  await page.route(/\/salesforce-vessels\?/, (route) => json(route, { message: 'A Capture-Pro role is required to view Salesforce vessels' }, 403));
  await page.goto(vesselsRoute);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A Capture-Pro role is required to view Salesforce vessels');
  await expect(rows(page)).toHaveCount(0);
});
