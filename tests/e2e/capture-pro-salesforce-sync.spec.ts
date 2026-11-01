import { expect, test, type Page, type Route } from '@playwright/test';
import type { CaptureProIntegrations, MenuNode, SalesforceSyncHealth, SalesforceSyncLogEntry, SalesforceSyncRun } from '@platform/shared';
import { organisation, setupAuthenticatedApp, user } from './support/app';

const syncRoute = '/app/product/Capture-Pro/salesforce-sync';
const opportunitiesRoute = '/app/product/Capture-Pro/opportunities';
const accountsRoute = '/app/product/Capture-Pro/accounts';
const competitorsRoute = '/app/product/Capture-Pro/competitors';
const bidBudgetsRoute = '/app/product/Capture-Pro/bid-budgets';
const fabricationYardsRoute = '/app/product/Capture-Pro/fabrication-yards';
const vesselsRoute = '/app/product/Capture-Pro/vessels';
const integrationsRoute = '/app/product/Capture-Pro/integrations';
const settingsEndpoint = `/api/organisations/${organisation.id}/modules/product-capture-pro/integrations/capture-pro`;

const node = (id: string, name: string, route: string | null, accessMode: 'readonly' | 'editable', children: MenuNode[] = []): MenuNode => ({
  id, parentId: null, name, route, icon: 'cloud', type: 'Secured', productId: 'product-capture-pro', displayOrder: 1,
  isActive: true, accessMode, children,
});
const salesforceMenus = (syncAccess: 'readonly' | 'editable'): MenuNode[] => [node('capture-pro', 'Capture-Pro', null, 'editable', [
  node('opportunity-workspace', 'Opportunity Workspace', '/app/product/Capture-Pro/opportunity-workspace', 'readonly'),
  node('salesforce', 'Salesforce', null, 'readonly', [
    node('salesforce-opportunities', 'Opportunities', opportunitiesRoute, 'readonly'),
    node('salesforce-accounts', 'Accounts', accountsRoute, 'readonly'),
    node('salesforce-competitors', 'Competitors', competitorsRoute, 'readonly'),
    node('salesforce-bid-budgets', 'Bid Budget Data', bidBudgetsRoute, 'readonly'),
    node('salesforce-fabrication-yards', 'Fabrication Yard', fabricationYardsRoute, 'readonly'),
    node('salesforce-vessels', 'Vessel Data', vesselsRoute, 'readonly'),
  ]),
  node('integrations', 'Integrations', integrationsRoute, 'editable'),
  node('salesforce-sync', 'Sync & Health', syncRoute, syncAccess),
]),
];

type Entry = SalesforceSyncLogEntry;
const run = (objectType: Entry['objectType'], status: 'Succeeded' | 'Failed', minute: number, overrides: Partial<Entry> = {}): Entry => ({
  id: `${objectType}-${minute}`, objectType, status,
  startedAt: new Date(Date.UTC(2026, 9, 20, 1, minute)).toISOString(),
  completedAt: new Date(Date.UTC(2026, 9, 20, 1, minute, 10)).toISOString(),
  receivedCount: status === 'Succeeded' ? (objectType === 'Account' ? 9120 : 3413) : 0,
  matchedCount: status === 'Succeeded' ? (objectType === 'Account' ? 9120 : 3308) : 0,
  insertedCount: status === 'Succeeded' ? 5 : 0, updatedCount: status === 'Succeeded' ? 3303 : 0, removedCount: status === 'Succeeded' ? 2 : 0,
  errorMessage: status === 'Failed' ? 'Salesforce rejected the token request (400)' : null, startedByCurrentUser: true,
  ...overrides,
});
const healthFor = (runs: Entry[]): SalesforceSyncHealth => {
  const success = runs.findIndex((entry) => entry.status === 'Succeeded');
  return {
    status: runs.length === 0 ? 'Not synchronized' : runs[0].status === 'Succeeded' ? 'Healthy' : 'Failing',
    lastRunAt: runs[0]?.completedAt ?? null,
    lastSuccessfulAt: runs.find((entry) => entry.status === 'Succeeded')?.completedAt ?? null,
    lastFailedAt: runs.find((entry) => entry.status === 'Failed')?.completedAt ?? null,
    consecutiveFailures: success === -1 ? runs.length : success,
    recentRunCount: runs.length,
    recentSuccessCount: runs.filter((entry) => entry.status === 'Succeeded').length,
  };
};
const logFor = (runs: Entry[]) => {
  const opportunities = runs.filter((entry) => entry.objectType === 'Opportunity');
  const accounts = runs.filter((entry) => entry.objectType === 'Account');
  const competitors = runs.filter((entry) => entry.objectType === 'Competitor');
  const bidBudgets = runs.filter((entry) => entry.objectType === 'Bid Budget');
  const fabricationYards = runs.filter((entry) => entry.objectType === 'Fabrication Yard');
  const vessels = runs.filter((entry) => entry.objectType === 'Vessel');
  return {
    health: { opportunities: healthFor(opportunities), accounts: healthFor(accounts), competitors: healthFor(competitors), bidBudgets: healthFor(bidBudgets), fabricationYards: healthFor(fabricationYards), vessels: healthFor(vessels) },
    lastRuns: { opportunities: opportunities[0] ?? null, accounts: accounts[0] ?? null, competitors: competitors[0] ?? null, bidBudgets: bidBudgets[0] ?? null, fabricationYards: fabricationYards[0] ?? null, vessels: vessels[0] ?? null },
    runs,
  };
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function signIn(page: Page, globalRoles: string[], syncAccess: 'readonly' | 'editable', configured = true) {
  await setupAuthenticatedApp(page, { currentUser: { ...user, globalRoles }, menus: salesforceMenus(syncAccess) });
  await page.route('**/api/organisations/mine', (route) => json(route, [{ ...organisation, membership: 'Member' }]));
  const settings: CaptureProIntegrations = {
    salesforce: {
      authType: 'OAuth2.0', grantType: 'client_credentials', accessTokenUrl: configured ? 'https://example.my.salesforce.com/services/oauth2/token' : '',
      clientId: configured ? 'example-client' : '', clientSecretConfigured: configured, updatedAt: null,
    },
    spinergie: { apiKeyConfigured: false, updatedAt: null },
  };
  await page.route(`**${settingsEndpoint}`, (route) => json(route, settings));
}

async function mockLog(page: Page, runs: Entry[]) {
  const state = { runs };
  await page.route(/\/salesforce-opportunities\/sync-runs(?:\?|$)/, (route) => json(route, logFor(state.runs)));
  return state;
}

const opportunityPanel = (page: Page) => page.getByRole('region', { name: 'Opportunities' });
const accountPanel = (page: Page) => page.getByRole('region', { name: 'Accounts' });
const competitorPanel = (page: Page) => page.getByRole('region', { name: 'Competitors' });
const bidBudgetPanel = (page: Page) => page.getByRole('region', { name: 'Bid Budget Data' });
const fabricationYardPanel = (page: Page) => page.getByRole('region', { name: 'Fabrication Yard' });
const vesselPanel = (page: Page) => page.getByRole('region', { name: 'Vessel Data' });

test('Capture-Pro keeps Salesforce data separate and Sync & Health after Integrations', async ({ page }) => {
  await signIn(page, ['Capture-Pro Module Administrator'], 'editable');
  await mockLog(page, [run('Opportunity', 'Succeeded', 10)]);
  await page.goto('/app/products');
  await expect(page.getByRole('button', { name: 'Capture-Pro', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Salesforce', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Opportunities', exact: true })).toHaveAttribute('href', opportunitiesRoute);
  await expect(page.getByRole('link', { name: 'Accounts', exact: true })).toHaveAttribute('href', accountsRoute);
  await expect(page.getByRole('link', { name: 'Competitors', exact: true })).toHaveAttribute('href', competitorsRoute);
  await expect(page.getByRole('link', { name: 'Bid Budget Data', exact: true })).toHaveAttribute('href', bidBudgetsRoute);
  await expect(page.getByRole('link', { name: 'Fabrication Yard', exact: true })).toHaveAttribute('href', fabricationYardsRoute);
  await expect(page.getByRole('link', { name: 'Vessel Data', exact: true })).toHaveAttribute('href', vesselsRoute);
  await page.getByRole('button', { name: 'Salesforce', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Opportunities', exact: true })).not.toBeVisible();
  await expect(page.getByRole('link', { name: 'Opportunity Workspace', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Integrations', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sync & Health', exact: true })).toBeVisible();
  const captureProLinks = await page.locator('aside nav a[href^="/app/product/Capture-Pro"]').evaluateAll((links) => links.filter((link) => link.getClientRects().length > 0).map((link) => link.textContent?.trim()));
  expect(captureProLinks.slice(-2)).toEqual(['Integrations', 'Sync & Health']);
  await page.getByRole('link', { name: 'Sync & Health', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${syncRoute}$`));
  await expect(page.getByRole('heading', { name: 'Sync & Health' })).toBeVisible();
});

test('an administrator syncs opportunities; only the opportunity health and log change', async ({ page }) => {
  await signIn(page, ['Capture-Pro Module Administrator'], 'editable');
  const state = await mockLog(page, [run('Opportunity', 'Failed', 5)]);
  const completed: SalesforceSyncRun = run('Opportunity', 'Succeeded', 20);
  await page.route(/\/salesforce-opportunities\/sync$/, (route) => {
    state.runs = [run('Opportunity', 'Succeeded', 20), ...state.runs];
    return json(route, completed);
  });
  await page.goto(syncRoute);
  await expect(page.getByTestId('salesforce-health-status-opportunities')).toHaveText('Failing');
  await expect(page.getByTestId('salesforce-health-status-accounts')).toHaveText('Not synchronized');
  await expect(page.getByLabel('Opportunities last run details')).toContainText('Salesforce rejected the token request (400)');

  const request = page.waitForRequest((candidate) => new URL(candidate.url()).pathname.endsWith('/salesforce-opportunities/sync') && candidate.method() === 'POST');
  await opportunityPanel(page).getByRole('button', { name: 'Sync opportunities now' }).click();
  expect((await request).postDataJSON()).toEqual({ orgId: organisation.id });
  await expect(opportunityPanel(page).getByRole('status')).toContainText('3308 matching opportunities (5 new, 3303 updated, 2 no longer in the extract)');
  await expect(page.getByTestId('salesforce-health-status-opportunities')).toHaveText('Healthy');
  await expect(page.getByTestId('salesforce-health-status-accounts')).toHaveText('Not synchronized');
  await expect(page.getByLabel('Opportunities last run details')).toContainText('3413 / 3308');
  const log = page.getByRole('table', { name: 'Salesforce sync run log' });
  await expect(log.locator('tbody tr')).toHaveCount(2);
  await expect(log.locator('tbody tr').first()).toContainText('Opportunity');
  await expect(log.locator('tbody tr').first()).toContainText('You');
});

test('an administrator syncs accounts separately and the log shows the Account type', async ({ page }) => {
  await signIn(page, ['Global Administrator'], 'editable');
  const state = await mockLog(page, [run('Opportunity', 'Succeeded', 10)]);
  let opportunitySyncRequested = false;
  await page.route(/\/salesforce-opportunities\/sync$/, (route) => { opportunitySyncRequested = true; return json(route, {}); });
  await page.route(/\/salesforce-accounts\/sync$/, (route) => {
    const completed = run('Account', 'Succeeded', 30);
    state.runs = [completed, ...state.runs];
    return json(route, completed);
  });
  await page.goto(syncRoute);
  const request = page.waitForRequest((candidate) => new URL(candidate.url()).pathname.endsWith('/salesforce-accounts/sync') && candidate.method() === 'POST');
  await accountPanel(page).getByRole('button', { name: 'Sync accounts now' }).click();
  expect((await request).postDataJSON()).toEqual({ orgId: organisation.id });
  await expect(accountPanel(page).getByRole('status')).toContainText('9120 accounts (5 new, 3303 updated, 2 no longer in Salesforce)');
  await expect(page.getByTestId('salesforce-health-status-accounts')).toHaveText('Healthy');
  await expect(page.getByLabel('Accounts last run details')).toContainText('9120 / 9120');
  const rows = page.getByRole('table', { name: 'Salesforce sync run log' }).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Account');
  await expect(rows.nth(1)).toContainText('Opportunity');
  expect(opportunitySyncRequested).toBe(false);
});

test('an administrator syncs competitors separately and only competitor health changes', async ({ page }) => {
  await signIn(page, ['Capture-Pro Module Administrator'], 'editable');
  const state = await mockLog(page, [run('Account', 'Failed', 8), run('Opportunity', 'Succeeded', 10)]);
  let otherSyncRequested = false;
  await page.route(/\/salesforce-(?:opportunities|accounts)\/sync$/, (route) => { otherSyncRequested = true; return json(route, {}); });
  await page.route(/\/salesforce-competitors\/sync$/, (route) => {
    const completed = run('Competitor', 'Succeeded', 40, { receivedCount: 812, matchedCount: 812, insertedCount: 812, updatedCount: 0, removedCount: 0 });
    state.runs = [completed, ...state.runs];
    return json(route, completed);
  });
  await page.goto(syncRoute);
  await expect(page.getByTestId('salesforce-health-status-competitors')).toHaveText('Not synchronized');
  const request = page.waitForRequest((candidate) => new URL(candidate.url()).pathname.endsWith('/salesforce-competitors/sync') && candidate.method() === 'POST');
  await competitorPanel(page).getByRole('button', { name: 'Sync competitors now' }).click();
  expect((await request).postDataJSON()).toEqual({ orgId: organisation.id });
  await expect(competitorPanel(page).getByRole('status')).toContainText('812 competitor records (812 new, 0 updated, 0 no longer in Salesforce)');
  await expect(page.getByTestId('salesforce-health-status-competitors')).toHaveText('Healthy');
  await expect(page.getByTestId('salesforce-health-status-accounts')).toHaveText('Failing');
  await expect(page.getByTestId('salesforce-health-status-opportunities')).toHaveText('Healthy');
  await expect(page.getByLabel('Competitors last run details')).toContainText('812 / 812');
  const rows = page.getByRole('table', { name: 'Salesforce sync run log' }).locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('Competitor');
  expect(otherSyncRequested).toBe(false);
});

test('an administrator syncs bid budgets separately and a failure marks only bid budget health as failing', async ({ page }) => {
  await signIn(page, ['Global Administrator'], 'editable');
  const state = await mockLog(page, [run('Competitor', 'Succeeded', 10)]);
  let otherSyncRequested = false;
  let attempt = 0;
  await page.route(/\/salesforce-(?:opportunities|accounts|competitors)\/sync$/, (route) => { otherSyncRequested = true; return json(route, {}); });
  await page.route(/\/salesforce-bid-budgets\/sync$/, (route) => {
    attempt++;
    if (attempt === 1) {
      state.runs = [run('Bid Budget', 'Failed', 20, { errorMessage: 'Salesforce rejected the bid budget query (400)' }), ...state.runs];
      return json(route, { statusCode: 502, message: 'Salesforce rejected the bid budget query (400)' }, 502);
    }
    const completed = run('Bid Budget', 'Succeeded', 40, { receivedCount: 420, matchedCount: 420, insertedCount: 420, updatedCount: 0, removedCount: 0 });
    state.runs = [completed, ...state.runs];
    return json(route, completed);
  });
  await page.goto(syncRoute);
  await expect(page.getByTestId('salesforce-health-status-bidBudgets')).toHaveText('Not synchronized');
  await bidBudgetPanel(page).getByRole('button', { name: 'Sync bid budgets now' }).click();
  await expect(bidBudgetPanel(page).getByRole('alert')).toContainText('Salesforce rejected the bid budget query (400)');
  await expect(page.getByTestId('salesforce-health-status-bidBudgets')).toHaveText('Failing');
  await expect(page.getByTestId('salesforce-health-status-competitors')).toHaveText('Healthy');
  const request = page.waitForRequest((candidate) => new URL(candidate.url()).pathname.endsWith('/salesforce-bid-budgets/sync') && candidate.method() === 'POST');
  await bidBudgetPanel(page).getByRole('button', { name: 'Sync bid budgets now' }).click();
  expect((await request).postDataJSON()).toEqual({ orgId: organisation.id });
  await expect(bidBudgetPanel(page).getByRole('status')).toContainText('420 bid budget records (420 new, 0 updated, 0 no longer in Salesforce)');
  await expect(page.getByTestId('salesforce-health-status-bidBudgets')).toHaveText('Healthy');
  await expect(page.getByLabel('Bid Budget Data last run details')).toContainText('420 / 420');
  const rows = page.getByRole('table', { name: 'Salesforce sync run log' }).locator('tbody tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText('Bid Budget');
  expect(otherSyncRequested).toBe(false);
});

test('an administrator syncs fabrication yards separately and only fabrication yard health changes', async ({ page }) => {
  await signIn(page, ['Capture-Pro Module Administrator'], 'editable');
  const state = await mockLog(page, [run('Bid Budget', 'Failed', 8)]);
  let otherSyncRequested = false;
  await page.route(/\/salesforce-(?:opportunities|accounts|competitors|bid-budgets)\/sync$/, (route) => { otherSyncRequested = true; return json(route, {}); });
  await page.route(/\/salesforce-fabrication-yards\/sync$/, (route) => {
    const completed = run('Fabrication Yard', 'Succeeded', 45, { receivedCount: 64, matchedCount: 64, insertedCount: 64, updatedCount: 0, removedCount: 0 });
    state.runs = [completed, ...state.runs];
    return json(route, completed);
  });
  await page.goto(syncRoute);
  await expect(page.getByTestId('salesforce-health-status-fabricationYards')).toHaveText('Not synchronized');
  const request = page.waitForRequest((candidate) => new URL(candidate.url()).pathname.endsWith('/salesforce-fabrication-yards/sync') && candidate.method() === 'POST');
  await fabricationYardPanel(page).getByRole('button', { name: 'Sync fabrication yards now' }).click();
  expect((await request).postDataJSON()).toEqual({ orgId: organisation.id });
  await expect(fabricationYardPanel(page).getByRole('status')).toContainText('64 fabrication yards (64 new, 0 updated, 0 no longer in Salesforce)');
  await expect(page.getByTestId('salesforce-health-status-fabricationYards')).toHaveText('Healthy');
  await expect(page.getByTestId('salesforce-health-status-bidBudgets')).toHaveText('Failing');
  await expect(page.getByLabel('Fabrication Yard last run details')).toContainText('64 / 64');
  const rows = page.getByRole('table', { name: 'Salesforce sync run log' }).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Fabrication Yard');
  expect(otherSyncRequested).toBe(false);
});

test('an administrator syncs vessels separately and each panel identifies its Salesforce object', async ({ page }) => {
  await signIn(page, ['Global Administrator'], 'editable');
  const state = await mockLog(page, [run('Fabrication Yard', 'Succeeded', 8)]);
  let otherSyncRequested = false;
  await page.route(/\/salesforce-(?:opportunities|accounts|competitors|bid-budgets|fabrication-yards)\/sync$/, (route) => { otherSyncRequested = true; return json(route, {}); });
  await page.route(/\/salesforce-vessels\/sync$/, (route) => {
    const completed = run('Vessel', 'Succeeded', 50, { receivedCount: 212, matchedCount: 212, insertedCount: 212, updatedCount: 0, removedCount: 0 });
    state.runs = [completed, ...state.runs];
    return json(route, completed);
  });
  await page.goto(syncRoute);
  for (const [panel, objectName] of [['Opportunities', 'Opportunity'], ['Accounts', 'Account'], ['Competitors', 'Project_Competitor_Details__c'], ['Bid Budget Data', 'Opportunity_Bid_Budget__c'], ['Fabrication Yard', 'Fabrication_Yard__c'], ['Vessel Data', 'Vessel__c']]) {
    await expect(page.getByRole('region', { name: panel }).getByTestId('salesforce-data-source')).toHaveText(`Data source: Salesforce· ${objectName}`);
  }
  await expect(page.getByTestId('salesforce-health-status-vessels')).toHaveText('Not synchronized');
  const request = page.waitForRequest((candidate) => new URL(candidate.url()).pathname.endsWith('/salesforce-vessels/sync') && candidate.method() === 'POST');
  await vesselPanel(page).getByRole('button', { name: 'Sync vessels now' }).click();
  expect((await request).postDataJSON()).toEqual({ orgId: organisation.id });
  await expect(vesselPanel(page).getByRole('status')).toContainText('212 vessels (212 new, 0 updated, 0 no longer in Salesforce)');
  await expect(page.getByTestId('salesforce-health-status-vessels')).toHaveText('Healthy');
  await expect(page.getByTestId('salesforce-health-status-fabricationYards')).toHaveText('Healthy');
  await expect(page.getByLabel('Vessel Data last run details')).toContainText('212 / 212');
  const rows = page.getByRole('table', { name: 'Salesforce sync run log' }).locator('tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('Vessel');
  expect(otherSyncRequested).toBe(false);
});

test('a failed account sync shows its reason and marks only account health as failing', async ({ page }) => {
  await signIn(page, ['Global Administrator'], 'editable');
  const state = await mockLog(page, [run('Opportunity', 'Succeeded', 10), run('Account', 'Succeeded', 5)]);
  await page.route(/\/salesforce-accounts\/sync$/, (route) => {
    state.runs = [run('Account', 'Failed', 30, { errorMessage: 'Salesforce returned more than 50000 accounts' }), ...state.runs];
    return json(route, { statusCode: 502, message: 'Salesforce returned more than 50000 accounts' }, 502);
  });
  await page.goto(syncRoute);
  await accountPanel(page).getByRole('button', { name: 'Sync accounts now' }).click();
  await expect(accountPanel(page).getByRole('alert')).toContainText('Salesforce returned more than 50000 accounts');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByTestId('salesforce-health-status-accounts')).toHaveText('Failing');
  await expect(page.getByTestId('salesforce-health-status-opportunities')).toHaveText('Healthy');
  await expect(page.getByLabel('Accounts health details').getByText('Consecutive failures').locator('xpath=following-sibling::dd[1]')).toHaveText('1');
});

test('managers and analysts see health and the log read-only without sync actions', async ({ page }) => {
  await signIn(page, ['Capture-Pro Analyst'], 'readonly');
  await mockLog(page, [run('Account', 'Succeeded', 12, { startedByCurrentUser: false }), run('Opportunity', 'Succeeded', 10, { startedByCurrentUser: false })]);
  let syncRequested = false;
  await page.route(/\/salesforce-(?:opportunities|accounts|competitors|bid-budgets|fabrication-yards|vessels)\/sync$/, (route) => { syncRequested = true; return json(route, {}); });
  await page.goto(syncRoute);
  await expect(page.getByTestId('salesforce-health-status-opportunities')).toHaveText('Healthy');
  await expect(page.getByTestId('salesforce-health-status-accounts')).toHaveText('Healthy');
  await expect(page.getByTestId('salesforce-health-status-competitors')).toHaveText('Not synchronized');
  await expect(page.getByTestId('salesforce-health-status-bidBudgets')).toHaveText('Not synchronized');
  await expect(page.getByTestId('salesforce-health-status-fabricationYards')).toHaveText('Not synchronized');
  await expect(page.getByRole('button', { name: /Sync (opportunities|accounts|competitors|bid budgets|fabrication yards|vessels) now/ })).toHaveCount(0);
  await expect(page.getByTestId('salesforce-health-status-vessels')).toHaveText('Not synchronized');
  await expect(page.getByText('Only integration administrators can run a sync.')).toHaveCount(6);
  await expect(page.getByRole('table', { name: 'Salesforce sync run log' })).toContainText('Another administrator');
  expect(syncRequested).toBe(false);
});

test('shows not-synchronized health and blocks all syncs until credentials are saved', async ({ page }) => {
  await signIn(page, ['Capture-Pro Module Administrator'], 'editable', false);
  await mockLog(page, []);
  await page.goto(syncRoute);
  await expect(page.getByTestId('salesforce-health-status-opportunities')).toHaveText('Not synchronized');
  await expect(page.getByTestId('salesforce-health-status-accounts')).toHaveText('Not synchronized');
  await expect(page.getByText('No sync runs have been recorded.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync opportunities now' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sync accounts now' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sync competitors now' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sync bid budgets now' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sync fabrication yards now' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Sync vessels now' })).toBeDisabled();
  await expect(page.getByRole('main').getByRole('link', { name: 'Integrations', exact: true })).toHaveAttribute('href', integrationsRoute);
});

test('a log loading failure is reported instead of showing healthy status', async ({ page }) => {
  await signIn(page, ['Capture-Pro Analyst'], 'readonly');
  await page.route(/\/salesforce-opportunities\/sync-runs(?:\?|$)/, (route) => json(route, { message: 'A Capture-Pro role is required to view Salesforce sync health' }, 403));
  await page.goto(syncRoute);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('A Capture-Pro role is required to view Salesforce sync health');
  await expect(page.getByTestId('salesforce-health-status-opportunities')).toHaveCount(0);
});

test('Integrations keeps credentials only and links to Sync & Health', async ({ page }) => {
  await signIn(page, ['Capture-Pro Module Administrator'], 'editable');
  await page.goto(integrationsRoute);
  await expect(page.getByRole('heading', { name: 'Integrations', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sync (opportunities|accounts|competitors|bid budgets|fabrication yards|vessels) now/ })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: 'Capture-Pro > Sync & Health' })).toHaveAttribute('href', syncRoute);
});
