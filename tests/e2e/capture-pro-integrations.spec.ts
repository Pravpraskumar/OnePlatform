import { randomBytes } from 'node:crypto';
import { expect, test, type Page, type Route } from '@playwright/test';
import type { CaptureProIntegrations, MenuNode } from '@platform/shared';
import { organisation, setupAuthenticatedApp, user } from './support/app';

const integrationRoute = '/app/product/Capture-Pro/integrations';
const endpoint = `/api/organisations/${organisation.id}/modules/product-capture-pro/integrations/capture-pro`;
const integrationMenu: MenuNode = {
  id: 'capture-pro-integrations', parentId: null, name: 'Integrations', route: integrationRoute,
  icon: 'key-round', type: 'Secured', productId: 'product-capture-pro', displayOrder: 1,
  isActive: true, accessMode: 'editable', children: [],
};
const moduleAdministrator = { ...user, globalRoles: ['Capture-Pro Module Administrator'] };
const emptySettings = (): CaptureProIntegrations => ({
  salesforce: { authType: 'OAuth2.0', grantType: 'client_credentials', accessTokenUrl: '', clientId: '', clientSecretConfigured: false, updatedAt: null },
  spinergie: { apiKeyConfigured: false, updatedAt: null },
});

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockIntegrations(page: Page, options: { forbidden?: boolean; failSave?: boolean; configured?: boolean } = {}) {
  let settings = emptySettings();
  if (options.configured) {
    settings.salesforce = { ...settings.salesforce, accessTokenUrl: 'https://example.my.salesforce.com/services/oauth2/token', clientId: 'example-client', clientSecretConfigured: true };
    settings.spinergie.apiKeyConfigured = true;
  }
  await page.route(`**${endpoint}**`, (route) => {
    if (options.forbidden) return json(route, { message: 'Capture-Pro integration administrator access required' }, 403);
    const request = route.request();
    if (request.method() === 'GET') return json(route, settings);
    if (options.failSave) return json(route, { message: 'Integration settings could not be saved' }, 503);
    if (request.method() === 'DELETE') {
      if (new URL(request.url()).pathname.endsWith('/salesforce')) settings.salesforce = emptySettings().salesforce;
      else settings.spinergie = emptySettings().spinergie;
    } else if (new URL(request.url()).pathname.endsWith('/salesforce')) {
      const body = request.postDataJSON();
      settings.salesforce = {
        authType: body.authType, grantType: body.grantType, accessTokenUrl: body.accessTokenUrl,
        clientId: body.clientId, clientSecretConfigured: true, updatedAt: '2026-10-20T00:00:00.000Z',
      };
    } else {
      settings.spinergie = { apiKeyConfigured: true, updatedAt: '2026-10-20T00:00:00.000Z' };
    }
    return json(route, settings);
  });
}

test.beforeEach(async ({ page }) => {
  await setupAuthenticatedApp(page, { currentUser: moduleAdministrator, menus: [integrationMenu] });
  await page.route('**/api/organisations/mine', (route) => json(route, [{ ...organisation, membership: 'Member' }]));
  await page.route(/\/salesforce-opportunities\/sync-status(?:\?|$)/, (route) => json(route, { lastSync: null }));
});

test('module administrator opens integrations from navigation and saves Salesforce credentials', async ({ page }) => {
  await mockIntegrations(page);
  await page.goto('/app/products');
  await page.getByRole('link', { name: 'Integrations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Integrations', exact: true })).toBeVisible();
  await expect(page.getByLabel('Auth Type', { exact: true })).toHaveValue('OAuth2.0');
  await expect(page.getByLabel('Grant Type', { exact: true })).toHaveValue('Client Credentials');
  await expect(page.getByLabel('Access Token URL')).toHaveValue('https://mcdermott.my.salesforce.com/services/oauth2/token');
  await expect(page.getByLabel('Client Secret', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByLabel('Client ID', { exact: true }).fill('example-client');
  const ephemeralSecret = randomBytes(24).toString('hex');
  await page.getByLabel('Client Secret', { exact: true }).fill(ephemeralSecret);
  const saved = page.waitForRequest((request) => new URL(request.url()).pathname === `${endpoint}/salesforce` && request.method() === 'PUT');
  await page.getByRole('button', { name: 'Save Salesforce', exact: true }).click();
  expect((await saved).postDataJSON()).toMatchObject({
    authType: 'OAuth2.0', grantType: 'client_credentials',
    accessTokenUrl: 'https://mcdermott.my.salesforce.com/services/oauth2/token',
    clientId: 'example-client', clientSecret: ephemeralSecret,
  });
  await expect(page.getByRole('status')).toContainText('Salesforce integration settings saved');
  await expect(page.getByLabel('Client Secret', { exact: true })).toHaveValue('');
  await expect(page.getByText('Credentials saved', { exact: true })).toBeVisible();
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }));
  expect(storage.includes(ephemeralSecret)).toBe(false);
});

test('Spinergie has only an API key and supports saving and replacing it', async ({ page }) => {
  await mockIntegrations(page);
  await page.goto(integrationRoute);
  const card = page.locator('form').filter({ has: page.getByLabel('API Key', { exact: true }) });
  await expect(card.locator('input')).toHaveCount(1);
  await expect(page.getByLabel('API Key', { exact: true })).toHaveAttribute('type', 'password');
  for (let iteration = 0; iteration < 2; iteration++) {
    const apiKey = randomBytes(24).toString('hex');
    await page.getByLabel('API Key', { exact: true }).fill(apiKey);
    const saved = page.waitForRequest((request) => new URL(request.url()).pathname === `${endpoint}/spinergie` && request.method() === 'PUT');
    await page.getByRole('button', { name: 'Save Spinergie', exact: true }).click();
    expect((await saved).postDataJSON()).toEqual({ apiKey });
    await expect(page.getByRole('status')).toContainText('Spinergie integration settings saved');
    await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
    const storage = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }));
    expect(storage.includes(apiKey)).toBe(false);
  }
  await expect(page.getByText('API key saved', { exact: true })).toBeVisible();
});

test('saved secrets remain blank on reload and Salesforce can retain its existing secret', async ({ page }) => {
  await mockIntegrations(page, { configured: true });
  await page.goto(integrationRoute);
  await expect(page.getByLabel('Client ID', { exact: true })).toHaveValue('example-client');
  await expect(page.getByLabel('Client Secret', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  const saved = page.waitForRequest((request) => new URL(request.url()).pathname === `${endpoint}/salesforce` && request.method() === 'PUT');
  await page.getByRole('button', { name: 'Save Salesforce', exact: true }).click();
  expect((await saved).postDataJSON()).not.toHaveProperty('clientSecret');
  await expect(page.getByRole('status')).toContainText('Salesforce integration settings saved');
  await page.reload();
  await expect(page.getByLabel('Client Secret', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
});

test('shows save failures instead of claiming a successful integration', async ({ page }) => {
  await mockIntegrations(page, { failSave: true });
  await page.goto(integrationRoute);
  await page.getByLabel('API Key', { exact: true }).fill(randomBytes(24).toString('hex'));
  await page.getByRole('button', { name: 'Save Spinergie', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Integration settings could not be saved');
  await expect(page.getByRole('status')).toHaveCount(0);
  await expect(page.getByText('API key saved', { exact: true })).toHaveCount(0);
});

test('direct navigation by a non-administrator does not expose configuration forms', async ({ page }) => {
  await mockIntegrations(page, { forbidden: true });
  await page.goto(integrationRoute);
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Capture-Pro integration administrator access required');
  await expect(page.getByLabel('Client Secret', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('API Key', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Connect SharePoint', exact: true })).toHaveCount(0);
});

test('SharePoint remains disabled without approved configuration and never contacts Graph automatically', async ({ page }) => {
  const graphRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).hostname === 'graph.microsoft.com') graphRequests.push(request.url());
  });
  await mockIntegrations(page);
  await page.goto(integrationRoute);
  await expect(page.getByRole('heading', { name: 'SharePoint', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect SharePoint', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Upload sample.json', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Disconnect SharePoint', exact: true })).toBeDisabled();
  expect(graphRequests).toEqual([]);
});

test('requires initial credentials before issuing a save request', async ({ page }) => {
  await mockIntegrations(page);
  await page.goto(integrationRoute);
  const writes: string[] = [];
  page.on('request', (request) => { if (request.method() === 'PUT') writes.push(request.url()); });
  await page.getByRole('button', { name: 'Save Salesforce', exact: true }).click();
  await expect(page.getByLabel('Client ID', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Save Spinergie', exact: true }).click();
  await expect(page.getByLabel('API Key', { exact: true })).toBeFocused();
  expect(writes).toEqual([]);
});

test('removes one provider without removing the other saved connection', async ({ page }) => {
  await mockIntegrations(page, { configured: true });
  await page.goto(integrationRoute);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remove Salesforce credentials' }).click();
  await expect(page.getByRole('status')).toContainText('Salesforce integration credentials removed');
  await expect(page.getByLabel('Client ID', { exact: true })).toHaveValue('');
  await expect(page.getByText('API key saved', { exact: true })).toBeVisible();
});

test('switching organisation clears entered credentials and ignores an old save response', async ({ page }) => {
  const otherOrganisation = { ...organisation, id: 'org-2', name: 'Other Organisation', membership: 'Member' };
  await page.route('**/api/organisations/mine', (route) => json(route, [{ ...organisation, membership: 'Member' }, otherOrganisation]));
  await mockIntegrations(page, { configured: true });
  const newSettings = emptySettings();
  newSettings.salesforce = { ...newSettings.salesforce, clientId: 'other-org-client', clientSecretConfigured: true };
  await page.route(`**${endpoint.replace(organisation.id, otherOrganisation.id)}`, (route) => json(route, newSettings));
  let releaseSave: (() => void) | undefined;
  const released = new Promise<void>((resolve) => { releaseSave = resolve; });
  let capturedSave: (() => void) | undefined;
  const captured = new Promise<void>((resolve) => { capturedSave = resolve; });
  await page.route(`**${endpoint}/spinergie`, async (route) => {
    capturedSave?.();
    await released;
    await json(route, { ...emptySettings(), spinergie: { apiKeyConfigured: true, updatedAt: null } });
  });
  await page.goto(integrationRoute);
  await page.getByLabel('Client Secret', { exact: true }).fill(randomBytes(24).toString('hex'));
  await page.getByLabel('API Key', { exact: true }).fill(randomBytes(24).toString('hex'));
  await page.getByRole('button', { name: 'Save Spinergie', exact: true }).click();
  await captured;
  await page.getByRole('button', { name: organisation.name, exact: true }).click();
  await page.getByRole('button', { name: otherOrganisation.name, exact: true }).click();
  await expect(page.getByLabel('Client ID', { exact: true })).toHaveValue('other-org-client');
  await expect(page.getByLabel('Client Secret', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('');
  const oldResponse = page.waitForResponse((response) => new URL(response.url()).pathname === `${endpoint}/spinergie`);
  releaseSave?.();
  await oldResponse;
  await expect(page.getByLabel('Client ID', { exact: true })).toHaveValue('other-org-client');
  await expect(page.getByText('API key saved', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('status')).toHaveCount(0);
});
