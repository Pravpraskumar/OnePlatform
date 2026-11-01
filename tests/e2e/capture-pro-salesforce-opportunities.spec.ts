import { expect, test, type Page, type Route } from '@playwright/test';
import type { MenuNode, SalesforceOpportunitySummary, SalesforceSyncRun } from '@platform/shared';
import { organisation, setupAuthenticatedApp, user } from './support/app';

const opportunitiesRoute = '/app/product/Capture-Pro/opportunities';
const workspaceRoute = '/app/product/Capture-Pro/opportunity-workspace';
const legacyRoute = '/app/product/Capture-Pro/salesforce-opportunities';
const menu = (id: string, name: string, route: string): MenuNode => ({
  id, parentId: null, name, route, icon: 'cloud', type: 'Secured', productId: 'product-capture-pro', displayOrder: 1,
  isActive: true, accessMode: 'readonly', children: [],
});
const successfulRun: SalesforceSyncRun = {
  id: 'run-1', status: 'Succeeded', startedAt: '2026-10-20T01:00:00.000Z', completedAt: '2026-10-20T01:01:00.000Z',
  receivedCount: 12, matchedCount: 3, insertedCount: 2, updatedCount: 1, removedCount: 1, errorMessage: null,
};
type Fields = SalesforceOpportunitySummary['fields'];
const opportunity = (overrides: Partial<SalesforceOpportunitySummary>, fieldOverrides: Fields = {}): SalesforceOpportunitySummary => {
  const row: SalesforceOpportunitySummary = {
    id: 'row-1', salesforceId: '006000000000001AAA', opportunityNumber: 'A1001', opportunityName: 'Deepwater tie-back',
    stageName: 'Closed Won', sourceStageName: 'Proposal', closeDate: '2027-03-31', region: 'Asia Pacific', country: 'Malaysia',
    businessLine: 'Subsea', subCategoryProductType: 'TBA', productTypeSubCategory: 'Subsea', priority: 'High',
    opportunityOwnerName: 'Owner One', forecastedRevenue: '1250000.5', forecastedGrossProfit: '250000', totalContractValue: '3000000',
    fields: {}, inExtract: true, lastSeenAt: '2026-10-20T01:01:00.000Z', removedFromExtractAt: null, ...overrides,
  };
  row.fields = {
    Id: row.salesforceId, Opportunity_Number__c: row.opportunityNumber, OpportunityName__c: row.opportunityName, StageName: row.stageName,
    CloseDate: row.closeDate, Region__c: row.region, Country__c: row.country, Sub_Category_Product_Type__c: row.subCategoryProductType,
    ProductTypeSubCategory: row.productTypeSubCategory, priority__c: row.priority, Opportunity_Owner_Name__c: row.opportunityOwnerName,
    Forecasted_Revenue__c: Number(row.forecastedRevenue), Forecasted_Gross_Profit__c: Number(row.forecastedGrossProfit),
    Total_Contract_Value_for_all__c: Number(row.totalContractValue), Business_Line__c: row.businessLine,
    Description: 'Line one of the description.\nLine two keeps its break.', Proposal_Submitted__c: true, ITT_Received__c: false,
    Competitor_s_Bid_Price__c: 990000, Winning_bidder__c: 'McDermott', Binding2__c: 'Yes', Bid_Slate__c: null,
    Service_Agreement_Business_Line__c: 'Subsea & Floating Facilities', RecordTypeId: '0120e000000UPzPAAW',
    ...fieldOverrides,
  };
  return row;
};
const current = [
  opportunity({}),
  opportunity({
    id: 'row-2', salesforceId: '006000000000002AAA', opportunityNumber: 'B2002', opportunityName: 'FPSO hull', stageName: 'Evaluation',
    sourceStageName: 'Evaluation', subCategoryProductType: 'Floating Production', productTypeSubCategory: 'Floater', country: 'Brazil', region: 'Americas',
  }, { Winning_bidder__c: null, Competitor_s_Bid_Price__c: 1500000 }),
];
const removed = opportunity({
  id: 'row-3', salesforceId: '006000000000003AAA', opportunityNumber: 'C3003', opportunityName: 'Retired pursuit',
  inExtract: false, removedFromExtractAt: '2026-10-20T01:01:00.000Z', stageName: 'Proposal', sourceStageName: 'Proposal',
});
const salesforceMenu = (): MenuNode => ({
  ...menu('capture-pro', 'Capture-Pro', ''), route: null,
  children: [menu('opportunity-workspace', 'Opportunity Workspace', workspaceRoute), { ...menu('salesforce', 'Salesforce', ''), route: null, children: [menu('capture-pro-opportunities', 'Opportunities', opportunitiesRoute)] }],
});

async function mockList(page: Page, rows = current, requests: string[] = []) {
  await page.route(/\/salesforce-opportunities\?/, (route) => {
    const url = new URL(route.request().url());
    requests.push(url.search);
    expect(url.searchParams.get('orgId')).toBe(organisation.id);
    const includeRemoved = url.searchParams.get('includeRemoved') === 'true';
    return json(route, { lastSync: successfulRun, opportunities: includeRemoved ? [...rows, removed] : rows });
  });
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function signIn(page: Page, globalRoles: string[], menus: MenuNode[]) {
  await setupAuthenticatedApp(page, { currentUser: { ...user, globalRoles }, menus });
  await page.route('**/api/organisations/mine', (route) => json(route, [{ ...organisation, membership: 'Member' }]));
}

test.describe('Salesforce opportunities screen', () => {
  test('an analyst opens Salesforce Opportunities from navigation, searches, and includes removed records', async ({ page }) => {
    await signIn(page, ['Capture-Pro Analyst'], [salesforceMenu()]);
    const requests: string[] = [];
    await mockList(page, current, requests);
    await page.goto('/app/products');
    await expect(page.getByRole('button', { name: 'Salesforce', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Opportunities', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${opportunitiesRoute}$`));
    await expect(page.getByRole('heading', { name: 'Salesforce Opportunities', exact: true })).toBeVisible();
    await expect(page.getByTestId('salesforce-data-source')).toHaveText('Data source: Salesforce· Opportunity');
    await expect(page.getByRole('button', { name: 'Add opportunity' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /My Workspace/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /to My Workspace/ })).toHaveCount(0);
    const won = page.locator('tbody tr').filter({ hasText: 'A1001' });
    await expect(won).toContainText('Closed Won');
    await expect(won).toContainText('Salesforce: Proposal');
    await expect(won).toContainText('TBA');
    await expect(won).toContainText((1250000.5).toLocaleString(undefined, { maximumFractionDigits: 2 }));
    await expect(page.locator('tbody tr').filter({ hasText: 'B2002' })).toContainText('Floater');
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await expect(page.locator('thead tr').first().locator('th')).toHaveCount(11);

    await page.getByLabel('Search Salesforce opportunities').fill('brazil');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText('B2002');
    await page.getByLabel('Search Salesforce opportunities').fill('');

    await page.getByLabel('Show records no longer in the Salesforce extract').check();
    await expect(page.locator('tbody tr')).toHaveCount(3);
    await expect(page.locator('tbody tr').filter({ hasText: 'C3003' })).toContainText('Not in latest extract');
    expect(requests.some((search) => search.includes('includeRemoved=true'))).toBe(true);
  });

  test('the column chooser can show every synced field and reset to key columns', async ({ page }) => {
    await signIn(page, ['Capture-Pro Manager'], [salesforceMenu()]);
    await mockList(page);
    await page.goto(opportunitiesRoute);
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await page.getByRole('button', { name: /Columns \(11\/50\)/ }).click();
    const chooser = page.getByRole('group', { name: 'Choose Salesforce columns' });
    await chooser.getByLabel("Competitor's Bid Price").check();
    await expect(page.getByRole('columnheader', { name: "Competitor's Bid Price" })).toBeVisible();
    await expect(page.locator('tbody tr').filter({ hasText: 'B2002' })).toContainText((1500000).toLocaleString());
    await chooser.getByRole('button', { name: 'Show all fields' }).click();
    await expect(page.locator('thead tr').first().locator('th')).toHaveCount(50);
    await expect(page.getByRole('columnheader', { name: 'Service Agreement Business Line' })).toBeVisible();
    await expect(page.locator('tbody tr').first()).toContainText('Subsea & Floating Facilities');
    await chooser.getByRole('button', { name: 'Reset to key columns' }).click();
    await expect(page.locator('thead tr').first().locator('th')).toHaveCount(11);
    await page.keyboard.press('Escape');
    await expect(chooser).toHaveCount(0);
  });

  test('the details panel shows every Salesforce field and sync status for a row', async ({ page }) => {
    await signIn(page, ['Capture-Pro Analyst'], [salesforceMenu()]);
    await mockList(page);
    await page.goto(opportunitiesRoute);
    await page.getByRole('button', { name: 'View details for A1001' }).click();
    const panel = page.getByRole('dialog', { name: 'Deepwater tie-back' });
    await expect(panel).toBeVisible();
    await expect(panel.locator('dt')).toHaveCount(53);
    await expect(panel).toContainText('Salesforce stage (before rules)');
    await expect(panel).toContainText('Proposal');
    await expect(panel).toContainText('Competitor_s_Bid_Price__c');
    await expect(panel).toContainText((990000).toLocaleString());
    await expect(panel).toContainText('McDermott');
    await expect(panel).toContainText('Line two keeps its break.');
    await expect(panel.getByRole('button', { name: 'Close opportunity details' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await page.locator('tbody tr').filter({ hasText: 'B2002' }).getByText('Brazil').click();
    await expect(page.getByRole('dialog', { name: 'FPSO hull' })).toBeVisible();
    await page.getByRole('button', { name: 'Close opportunity details' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('column filters narrow rows by choice, number expression, text, and yes/no values', async ({ page }) => {
    await signIn(page, ['Capture-Pro Analyst'], [salesforceMenu()]);
    const rows = [
      ...current,
      opportunity({
        id: 'row-4', salesforceId: '006000000000004AAA', opportunityNumber: 'D4004', opportunityName: 'Small SURF scope', stageName: 'Closed Won',
        sourceStageName: 'Closed Won', country: 'Norway', region: 'EARC', forecastedRevenue: '400000',
      }, { Proposal_Submitted__c: false }),
    ];
    await mockList(page, rows);
    await page.goto(opportunitiesRoute);
    await expect(page.locator('tbody tr')).toHaveCount(3);

    await page.getByLabel('Filter Stage', { exact: true }).selectOption('Closed Won');
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await page.getByLabel('Filter Forecasted Revenue', { exact: true }).fill('>1,000,000');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText('A1001');
    await expect(page.getByText('Showing 1–1 of 1 opportunities')).toBeVisible();
    await page.getByLabel('Filter Forecasted Revenue', { exact: true }).fill('100000..500000');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText('D4004');

    await page.getByRole('button', { name: 'Clear filters (2)' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(3);
    await expect(page.getByLabel('Filter Stage', { exact: true })).toHaveValue('');

    await page.getByLabel('Filter Opportunity Name', { exact: true }).fill('hull');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText('B2002');
    await page.getByLabel('Filter Opportunity Name', { exact: true }).fill('no such opportunity');
    await expect(page.getByText('No opportunities match the search or filters.')).toBeVisible();
    await page.getByLabel('Filter Opportunity Name', { exact: true }).fill('');

    await page.getByRole('button', { name: /Columns \(11\/50\)/ }).click();
    const chooser = page.getByRole('group', { name: 'Choose Salesforce columns' });
    await chooser.getByLabel('Proposal Submitted').check();
    await page.keyboard.press('Escape');
    await page.getByLabel('Filter Proposal Submitted', { exact: true }).selectOption('false');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText('D4004');

    await page.getByRole('button', { name: /Columns \(12\/50\)/ }).click();
    await chooser.getByLabel('Proposal Submitted').uncheck();
    await expect(page.locator('tbody tr')).toHaveCount(3);
    await expect(page.getByRole('button', { name: /Clear filters/ })).toHaveCount(0);
  });

  test('the table fits the page so its horizontal scrollbar and footer stay visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await signIn(page, ['Capture-Pro Analyst'], [salesforceMenu()]);
    const rows = Array.from({ length: 120 }, (_, index) => opportunity({
      id: `row-${index}`, salesforceId: `006${String(index).padStart(15, '0')}`, opportunityNumber: `P${String(index).padStart(4, '0')}`, opportunityName: `Pursuit ${index}`,
    }));
    await mockList(page, rows);
    await page.goto(opportunitiesRoute);
    await expect(page.locator('tbody tr')).toHaveCount(100);
    await page.getByRole('button', { name: /Columns \(11\/50\)/ }).click();
    await page.getByRole('group', { name: 'Choose Salesforce columns' }).getByRole('button', { name: 'Show all fields' }).click();
    await page.keyboard.press('Escape');

    const scroller = page.getByTestId('salesforce-table-scroll');
    const metrics = await scroller.evaluate((element) => {
      const main = element.closest('main')!;
      return {
        overflowX: element.scrollWidth > element.clientWidth,
        overflowY: element.scrollHeight > element.clientHeight,
        bottom: element.getBoundingClientRect().bottom,
        mainBottom: main.getBoundingClientRect().bottom,
        mainScrolls: main.scrollHeight > main.clientHeight + 1,
      };
    });
    expect(metrics.overflowX).toBe(true);
    expect(metrics.overflowY).toBe(true);
    expect(metrics.bottom).toBeLessThanOrEqual(metrics.mainBottom);
    expect(metrics.mainScrolls).toBe(false);
    await expect(page.getByRole('button', { name: 'Next page' })).toBeInViewport();

    await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(page.getByLabel('Filter Stage', { exact: true })).toBeInViewport();
  });

  test('large extracts are paginated', async ({ page }) => {
    await signIn(page, ['Capture-Pro Analyst'], [salesforceMenu()]);
    const rows = Array.from({ length: 205 }, (_, index) => opportunity({
      id: `row-${index}`, salesforceId: `006${String(index).padStart(15, '0')}`, opportunityNumber: `P${String(index).padStart(4, '0')}`, opportunityName: `Pursuit ${index}`,
    }));
    await mockList(page, rows);
    await page.goto(opportunitiesRoute);
    await expect(page.locator('tbody tr')).toHaveCount(100);
    await expect(page.getByText('Showing 1–100 of 205 opportunities')).toBeVisible();
    await page.getByRole('button', { name: 'Next page' }).click();
    await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.locator('tbody tr')).toHaveCount(5);
    await expect(page.getByText('Page 3 of 3')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next page' })).toBeDisabled();
  });

  test('the former Salesforce Opportunities address redirects to the renamed screen', async ({ page }) => {
    await signIn(page, ['Capture-Pro Manager'], [salesforceMenu()]);
    await mockList(page);
    await page.goto(legacyRoute);
    await expect(page).toHaveURL(new RegExp(`${opportunitiesRoute}$`));
    await expect(page.getByRole('heading', { name: 'Salesforce Opportunities', exact: true })).toBeVisible();
  });

  test('shows an empty state before the first sync', async ({ page }) => {
    await signIn(page, ['Capture-Pro Manager'], []);
    await page.route(/\/salesforce-opportunities\?/, (route) => json(route, { lastSync: null, opportunities: [] }));
    await page.goto(opportunitiesRoute);
    await expect(page.getByText('No Salesforce opportunities have been synchronized for this organisation.')).toBeVisible();
  });

  test('access denial is shown without rendering opportunity data', async ({ page }) => {
    await signIn(page, ['General User'], []);
    await page.route(/\/salesforce-opportunities\?/, (route) => json(route, { message: 'A Capture-Pro role is required to view Salesforce opportunities' }, 403));
    await page.goto(opportunitiesRoute);
    await expect(page.getByRole('main').getByRole('alert')).toContainText('A Capture-Pro role is required to view Salesforce opportunities');
    await expect(page.locator('tbody tr')).toHaveCount(0);
  });

  test('selects only chosen opportunities for My Workspace and keeps Salesforce data out of storage', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
    await signIn(page, ['Capture-Pro Analyst'], [salesforceMenu()]);
    await mockList(page, [opportunity({}, { RFP_Date__c: '2026-11-15', Bid_Submission_Date__c: '2026-12-01', Bid_Project_Manager_Name__c: 'Test Bid Manager' }), current[1]]);
    await page.goto('/app/products');
    await page.getByRole('link', { name: 'Opportunity Workspace', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${workspaceRoute}$`));
    await expect(page.getByRole('heading', { name: 'Opportunity Workspace', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add A1001 to My Workspace', exact: true }).click();
    await page.getByRole('tab', { name: 'My Workspace (1)', exact: true }).click();
    const panel = page.getByRole('article', { name: 'Workspace opportunity A1001' });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('2026-11-15');
    await expect(panel).toContainText('2026-12-01');
    await expect(panel).toContainText('Test Bid Manager');
    await expect(panel.getByTestId('opportunity-lifecycle-phase')).toHaveText('Pre-ITT');
    await expect(page.getByRole('complementary', { name: 'My selected opportunities' })).not.toContainText('FPSO hull');
    await expect(panel.getByRole('region', { name: 'Analysis — not implemented' })).not.toContainText('Test Bid Manager');
    const saved = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('captureProOpportunityWorkspace:')));
    expect(saved).toEqual([[`captureProOpportunityWorkspace:v1:${organisation.id}:${user.id}`, '["006000000000001AAA"]']]);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'My Workspace (1)', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(panel).toBeVisible();
    await page.getByRole('button', { name: 'Remove from My Workspace', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'No opportunities in My Workspace' })).toBeVisible();
    await expect(page.getByRole('article')).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole('tab', { name: 'My Workspace (0)', exact: true })).toBeVisible();
  });

  test('workspace refresh reflects Salesforce changes without changing receipt or approval data', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
    await signIn(page, ['Capture-Pro Analyst'], [salesforceMenu()]);
    await mockList(page, [opportunity({}, { RFP_Date__c: '2026-11-15' })]);
    await page.goto(workspaceRoute);
    await page.getByRole('button', { name: 'Add A1001 to My Workspace' }).click();
    await page.getByRole('tab', { name: 'My Workspace (1)', exact: true }).click();
    await expect(page.getByTestId('opportunity-lifecycle-phase')).toHaveText('Pre-ITT');
    await mockList(page, [opportunity({ opportunityName: 'Updated Salesforce pursuit' }, { RFP_Date__c: '2026-10-22', ITT_Received__c: false })]);
    await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Updated Salesforce pursuit' })).toBeVisible();
    await expect(page.getByTestId('opportunity-lifecycle-phase')).toHaveText('Post-ITT');
    await expect(page.getByRole('article')).toContainText('Not confirmed');
    await expect(page.getByRole('region', { name: 'Post-ITT — not implemented', exact: true })).toHaveText('Post-ITT');
  });

  test('another user or organisation selection is not loaded and missing ITT dates remain unknown', async ({ page }) => {
    await signIn(page, ['Capture-Pro Analyst'], [salesforceMenu()]);
    await page.addInitScript(({ orgId, userId }) => {
      localStorage.setItem(`captureProOpportunityWorkspace:v1:${orgId}:another-user`, '["006000000000002AAA"]');
      localStorage.setItem(`captureProOpportunityWorkspace:v1:another-org:${userId}`, '["006000000000002AAA"]');
    }, { orgId: organisation.id, userId: user.id });
    await mockList(page);
    await page.goto(workspaceRoute);
    await expect(page.getByRole('tab', { name: 'My Workspace (0)', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add A1001 to My Workspace' }).click();
    await page.getByRole('tab', { name: 'My Workspace (1)', exact: true }).click();
    await expect(page.getByTestId('opportunity-lifecycle-phase')).toHaveText('ITT date required');
    await expect(page.getByRole('article')).toContainText('Not supplied');
    await expect(page.getByRole('article')).not.toContainText('FPSO hull');
  });

  test('invalid saved selections show a recoverable error without silently overwriting them', async ({ page }) => {
    await signIn(page, ['Capture-Pro Analyst'], [salesforceMenu()]);
    await page.addInitScript(({ orgId, userId }) => {
      localStorage.setItem(`captureProOpportunityWorkspace:v1:${orgId}:${userId}`, '{invalid');
    }, { orgId: organisation.id, userId: user.id });
    await mockList(page);
    await page.goto(workspaceRoute);
    await expect(page.getByRole('main').getByRole('alert')).toContainText('could not be read');
    await expect(page.getByRole('button', { name: 'Add A1001 to My Workspace' })).toBeDisabled();
    await page.getByRole('button', { name: 'Clear saved selection', exact: true }).click();
    await page.getByRole('button', { name: 'Add A1001 to My Workspace' }).click();
    await expect(page.getByRole('tab', { name: 'My Workspace (1)', exact: true })).toBeVisible();
  });

  test('storage write failure does not claim that a selection was saved', async ({ page }) => {
    await signIn(page, ['Capture-Pro Analyst'], [salesforceMenu()]);
    await page.addInitScript(() => {
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key.startsWith('captureProOpportunityWorkspace:')) throw new DOMException('Storage unavailable', 'QuotaExceededError');
        return original.call(this, key, value);
      };
    });
    await mockList(page);
    await page.goto(workspaceRoute);
    await page.getByRole('button', { name: 'Add A1001 to My Workspace' }).click();
    await expect(page.getByRole('main').getByRole('alert')).toContainText('could not be saved');
    await expect(page.getByRole('tab', { name: 'My Workspace (0)', exact: true })).toBeVisible();
    await expect(page.getByText('My Workspace selection saved.')).toHaveCount(0);
  });

  test('opportunity workspace fits desktop and mobile without page-level horizontal overflow', async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-10-23T12:00:00Z'));
    await signIn(page, ['Capture-Pro Analyst'], [salesforceMenu()]);
    await mockList(page, [opportunity({}, { RFP_Date__c: '2026-11-15', Bid_Submission_Date__c: '2026-12-01' }), current[1]]);
    await page.goto(workspaceRoute);
    await page.getByRole('button', { name: 'Add A1001 to My Workspace' }).click();
    await page.getByRole('tab', { name: 'My Workspace (1)', exact: true }).click();
    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole('heading', { name: 'Pre-ITT intake', exact: true })).toBeVisible();
      const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
      expect(width.content).toBeLessThanOrEqual(width.viewport);
      if (viewport.width < 1024) {
        const list = await page.getByRole('complementary', { name: 'My selected opportunities' }).boundingBox();
        const details = await page.getByRole('article', { name: 'Workspace opportunity A1001' }).boundingBox();
        expect(list).not.toBeNull();
        expect(details).not.toBeNull();
        expect(list!.y + list!.height).toBeLessThanOrEqual(details!.y);
      }
      await page.screenshot({ path: testInfo.outputPath(`workspace-${viewport.width}.png`), fullPage: true });
    }
  });

  test('Salesforce remains a read-only full extract regardless of workspace selections', async ({ page }) => {
    await signIn(page, ['Capture-Pro Analyst'], [salesforceMenu()]);
    const requests: string[] = [];
    await mockList(page, current, requests);
    await page.goto(workspaceRoute);
    await page.getByRole('button', { name: 'Add A1001 to My Workspace' }).click();
    await page.getByRole('tab', { name: 'My Workspace (1)', exact: true }).click();
    await expect(page.getByRole('article', { name: 'Workspace opportunity A1001' })).toBeVisible();
    await page.goto(opportunitiesRoute);
    await expect(page.getByRole('heading', { name: 'Salesforce Opportunities', exact: true })).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await expect(page.getByRole('tab')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /My Workspace/ })).toHaveCount(0);
    expect(requests.at(-1)).not.toContain('includeRemoved');
    await page.goto(workspaceRoute);
    await expect(page.getByRole('tab', { name: 'My Workspace (1)', exact: true })).toHaveAttribute('aria-selected', 'true');
  });
});
