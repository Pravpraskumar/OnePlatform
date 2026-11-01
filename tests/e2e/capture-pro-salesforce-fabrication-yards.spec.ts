import { expect, test, type Page, type Route } from '@playwright/test';
import type { MenuNode, SalesforceFabricationYardSummary, SalesforceFieldDefinition, SalesforceSyncRun } from '@platform/shared';
import { organisation, setupAuthenticatedApp, user } from './support/app';

const fabricationYardsRoute = '/app/product/Capture-Pro/fabrication-yards';
const node = (id: string, name: string, route: string | null, children: MenuNode[] = []): MenuNode => ({
  id, parentId: null, name, route, icon: 'cloud', type: 'Secured', productId: 'product-capture-pro', displayOrder: 1,
  isActive: true, accessMode: 'readonly', children,
});
const menus = [node('capture-pro', 'Capture-Pro', null, [node('salesforce', 'Salesforce', null, [node('salesforce-fabrication-yards', 'Fabrication Yard', fabricationYardsRoute)])])];
const lastSync: SalesforceSyncRun = {
  id: 'run-1', status: 'Succeeded', startedAt: '2026-10-20T01:00:00.000Z', completedAt: '2026-10-20T01:00:20.000Z',
  receivedCount: 3, matchedCount: 3, insertedCount: 3, updatedCount: 0, removedCount: 0, errorMessage: null,
};
const fieldDefinitions: SalesforceFieldDefinition[] = [
  { name: 'Id', label: 'Record ID', type: 'id' },
  { name: 'Name', label: 'Fabrication Yard Name', type: 'string' },
  { name: 'CreatedDate', label: 'Created Date', type: 'datetime' },
  { name: 'Country__c', label: 'Country', type: 'picklist' },
  { name: 'Capacity_Tonnes__c', label: 'Capacity (t)', type: 'double' },
  { name: 'Active__c', label: 'Active', type: 'boolean' },
  { name: 'Notes__c', label: 'Notes', type: 'textarea' },
  ...Array.from({ length: 6 }, (_, index) => ({ name: `Extra_${index + 1}__c`, label: `Extra ${index + 1}`, type: 'string' })),
];
const yard = (index: number, fields: SalesforceFabricationYardSummary['fields'] = {}, overrides: Partial<SalesforceFabricationYardSummary> = {}): SalesforceFabricationYardSummary => {
  const name = typeof fields.Name === 'string' ? fields.Name : `Yard ${String(index).padStart(3, '0')}`;
  return {
    id: `yard-${index}`, salesforceId: `a0D${String(index).padStart(15, '0')}`, name,
    fields: {
      Id: `a0D${String(index).padStart(15, '0')}`, Name: name, CreatedDate: '2024-03-01T08:00:00.000+0000', Country__c: 'Indonesia',
      Capacity_Tonnes__c: 10000, Active__c: true, Notes__c: null, Extra_6__c: `extra-${index}`, ...fields,
    },
    inExtract: true, lastSeenAt: '2026-10-20T01:00:20.000Z', removedFromExtractAt: null, ...overrides,
  };
};
const current = [
  yard(1, { Name: 'Batam Yard', Capacity_Tonnes__c: 45000, Notes__c: 'Deepwater quay' }),
  yard(2, { Name: 'Jebel Ali Yard', Country__c: 'UAE', Capacity_Tonnes__c: 30000, Active__c: false }),
  yard(3, { Name: 'Qingdao Yard', Country__c: 'China', Capacity_Tonnes__c: 60000 }),
];
const removed = yard(4, { Name: 'Closed Yard' }, { inExtract: false, removedFromExtractAt: '2026-10-20T01:00:20.000Z' });
const rows = (page: Page) => page.locator('tbody tr');

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function signIn(page: Page, globalRoles: string[]) {
  await setupAuthenticatedApp(page, { currentUser: { ...user, globalRoles }, menus });
  await page.route('**/api/organisations/mine', (route) => json(route, [{ ...organisation, membership: 'Member' }]));
}

async function mockYards(page: Page, list = current, requests: string[] = []) {
  await page.route(/\/salesforce-fabrication-yards\?/, (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    expect(url.searchParams.get('orgId')).toBe(organisation.id);
    return json(route, { lastSync, fieldDefinitions, fabricationYards: url.searchParams.get('includeRemoved') === 'true' ? [...list, removed] : list });
  });
}

test('an analyst opens Fabrication Yard from the Salesforce menu and sees key columns with Salesforce labels', async ({ page }) => {
  await signIn(page, ['Capture-Pro Analyst']);
  await mockYards(page);
  await page.goto('/app/products');
  await page.getByRole('link', { name: 'Fabrication Yard', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${fabricationYardsRoute}$`));
  await expect(page.getByRole('heading', { name: 'Fabrication Yard', level: 1 })).toBeVisible();
  await expect(page.getByTestId('salesforce-data-source')).toHaveText('Data source: Salesforce· Fabrication_Yard__c');
  await expect(rows(page)).toHaveCount(3);
  const headers = page.locator('thead tr').first().locator('th');
  await expect(headers).toHaveText(['Fabrication Yard Name', 'Country', 'Capacity (t)', 'Active', 'Notes', 'Extra 1', 'Extra 2', 'Extra 3', 'Record ID']);
  await expect(page.getByRole('button', { name: 'Columns (9/13)' })).toBeVisible();
  const batam = rows(page).filter({ hasText: 'Batam Yard' });
  await expect(batam).toContainText('45,000');
  await expect(batam).toContainText('Deepwater quay');
  await expect(rows(page).filter({ hasText: 'Jebel Ali Yard' })).toContainText('No');
});

test('the column chooser shows any discovered field and filters follow Salesforce types', async ({ page }) => {
  await signIn(page, ['Capture-Pro Manager']);
  const requests: string[] = [];
  await mockYards(page, current, requests);
  await page.goto(fabricationYardsRoute);
  await page.getByRole('button', { name: 'Columns (9/13)' }).click();
  const chooser = page.getByRole('group', { name: 'Choose fabrication yard columns' });
  await chooser.getByLabel('Extra 6').check();
  await chooser.getByLabel('Notes').uncheck();
  await page.keyboard.press('Escape');
  await expect(page.locator('thead tr').first()).toContainText('Extra 6');
  await expect(page.locator('thead tr').first()).not.toContainText('Notes');
  await expect(rows(page).filter({ hasText: 'Batam Yard' })).toContainText('extra-1');

  await page.getByLabel('Filter Country', { exact: true }).selectOption('UAE');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText('Jebel Ali Yard');
  await page.getByLabel('Filter Country', { exact: true }).selectOption('');
  await page.getByLabel('Filter Capacity (t)', { exact: true }).fill('>40000');
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel('Filter Active', { exact: true }).selectOption('true');
  await expect(rows(page)).toHaveCount(2);
  await page.getByLabel('Filter Active', { exact: true }).selectOption('false');
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText('No fabrication yards match the search or filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters (2)' }).click();
  await page.getByLabel('Filter Fabrication Yard Name', { exact: true }).fill('qing');
  await expect(rows(page)).toHaveCount(1);
  await page.getByLabel('Filter Fabrication Yard Name', { exact: true }).fill('');

  await page.getByRole('button', { name: 'Columns (9/13)' }).click();
  await page.getByRole('group', { name: 'Choose fabrication yard columns' }).getByRole('button', { name: 'Show all fields' }).click();
  await expect(page.getByRole('button', { name: 'Columns (13/13)' })).toBeVisible();
  await page.getByRole('group', { name: 'Choose fabrication yard columns' }).getByRole('button', { name: 'Reset to key columns' }).click();
  await expect(page.getByRole('button', { name: 'Columns (9/13)' })).toBeVisible();

  await page.getByLabel('Show records no longer in Salesforce').check();
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).filter({ hasText: 'Closed Yard' })).toContainText('Not in latest extract');
  expect(requests.some((search) => search.includes('includeRemoved=true'))).toBe(true);
});

test('the details panel shows every discovered field with labels and API names', async ({ page }) => {
  await signIn(page, ['Capture-Pro Module Administrator']);
  await mockYards(page);
  await page.goto(fabricationYardsRoute);
  await page.getByRole('button', { name: 'View details for Batam Yard' }).click();
  const panel = page.getByRole('dialog', { name: 'Batam Yard' });
  await expect(panel).toBeVisible();
  for (const definition of fieldDefinitions) {
    await expect(panel).toContainText(definition.label);
    await expect(panel).toContainText(definition.name);
  }
  await expect(panel).toContainText('Deepwater quay');
  await expect(panel).toContainText('In latest extract');
  await expect(panel.getByRole('button', { name: 'Close fabrication yard details' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('large fabrication yard lists are paginated inside a table that fits the page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await signIn(page, ['Capture-Pro Analyst']);
  await mockYards(page, Array.from({ length: 140 }, (_, index) => yard(index + 10)));
  await page.goto(fabricationYardsRoute);
  await expect(rows(page)).toHaveCount(100);
  await expect(page.getByText('Showing 1–100 of 140 fabrication yards')).toBeVisible();
  const metrics = await page.getByTestId('salesforce-fabrication-yards-scroll').evaluate((element) => {
    const main = element.closest('main')!;
    return { bottom: element.getBoundingClientRect().bottom, mainBottom: main.getBoundingClientRect().bottom, mainScrolls: main.scrollHeight > main.clientHeight + 1 };
  });
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.mainBottom);
  expect(metrics.mainScrolls).toBe(false);
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(rows(page)).toHaveCount(40);
});

test('shows an empty state with a link to Sync & Health before the first fabrication yard sync', async ({ page }) => {
  await signIn(page, ['Capture-Pro Analyst']);
  await page.route(/\/salesforce-fabrication-yards\?/, (route) => json(route, { lastSync: null, fieldDefinitions: [], fabricationYards: [] }));
  await page.goto(fabricationYardsRoute);
  await expect(page.getByText('No Salesforce fabrication yards have been synchronized for this organisation.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sync fabrication yards now' })).toHaveAttribute('href', '/app/product/Capture-Pro/salesforce-sync');
  await expect(page.getByRole('button', { name: /Columns/ })).toHaveCount(0);
});

test('access denial is shown without rendering fabrication yard data', async ({ page }) => {
  await signIn(page, ['General User']);
  await page.route(/\/salesforce-fabrication-yards\?/, (route) => json(route, { message: 'A Capture-Pro role is required to view Salesforce fabrication yards' }, 403));
  await page.goto(fabricationYardsRoute);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A Capture-Pro role is required to view Salesforce fabrication yards');
  await expect(rows(page)).toHaveCount(0);
});
