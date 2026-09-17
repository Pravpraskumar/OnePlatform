import { expect, test } from '@playwright/test';
import { integrationMenu, moduleUsersMenu, setupAuthenticatedApp } from './support/app';

test('saves and removes a Signit authorization key without exposing it', async ({ page }) => {
  await setupAuthenticatedApp(page);
  let authorizationKeyConfigured = false;
  let baseUrl = '';
  let savedBody: unknown;

  await page.route('**/api/organisations/*/modules/*/integrations/signit', async (route) => {
    if (route.request().method() === 'PUT') {
      savedBody = route.request().postDataJSON();
      const body = savedBody as { baseUrl?: string; authorizationKey?: string; clearAuthorizationKey?: boolean };
      if (body.baseUrl) baseUrl = body.baseUrl.replace(/\/$/, '');
      if (body.clearAuthorizationKey) authorizationKeyConfigured = false;
      if (body.authorizationKey) authorizationKeyConfigured = true;
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'signit',
        baseUrl,
        authorizationKeyConfigured,
        webhookTokenConfigured: false,
        webhookTokenPrefix: null,
        webhookTokenCreatedAt: null,
        webhookPath: '/api/organisations/org-1/modules/product-creditguard/integrations/signit/webhook',
        updatedAt: authorizationKeyConfigured ? '2026-09-04T10:00:00.000Z' : null,
      }),
    });
  });

  await page.goto('/app/product/CreditGuard/application-setup/integration');
  await expect(page.getByRole('heading', { name: 'Integration' })).toBeVisible();
  await expect(page.getByText('Authorization key not configured')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save configuration' })).toBeDisabled();

  const baseUrlInput = page.getByLabel('Base URL');
  const keyInput = page.getByLabel('Authorization key');
  await baseUrlInput.fill('ftp://api.signit.example');
  await keyInput.fill('signit-secret-value');
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect(baseUrlInput).toHaveJSProperty('validity.valid', false);
  expect(savedBody).toBeUndefined();

  await baseUrlInput.fill('http://api.signit.example/');
  await page.getByRole('button', { name: 'Save configuration' }).click();

  await expect.poll(() => savedBody).toEqual({ baseUrl: 'http://api.signit.example/', authorizationKey: 'signit-secret-value' });
  await expect(page.getByText('Authorization key configured')).toBeVisible();
  await expect(baseUrlInput).toHaveValue('http://api.signit.example');
  await expect(keyInput).toHaveValue('');
  await expect(page.getByText('signit-secret-value')).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Authorization key configured')).toBeVisible();
  await expect(page.getByLabel('Base URL')).toHaveValue('http://api.signit.example');
  await expect(page.getByLabel('Authorization key')).toHaveValue('');
  await expect(page.getByText('signit-secret-value')).toHaveCount(0);

  await page.getByLabel('Base URL').fill('https://api2.signit.example');
  await page.getByRole('button', { name: 'Save configuration' }).click();
  await expect.poll(() => savedBody).toEqual({ baseUrl: 'https://api2.signit.example' });
  await expect(page.getByText('Authorization key configured')).toBeVisible();

  await page.getByRole('button', { name: 'Remove key' }).click();
  await expect.poll(() => savedBody).toEqual({ clearAuthorizationKey: true });
  await expect(page.getByText('Authorization key not configured')).toBeVisible();
});

test('generates, conceals, rotates, and revokes the Signit webhook token', async ({ page }) => {
  await setupAuthenticatedApp(page);
  let webhookTokenConfigured = false;
  let tokenPrefix: string | null = null;
  let tokenCreatedAt: string | null = null;
  let generation = 0;
  let revokeCalls = 0;
  const webhookPath = '/api/organisations/org-1/modules/product-creditguard/integrations/signit/webhook';

  await page.route('**/api/organisations/*/modules/*/integrations/signit', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      provider: 'signit',
      baseUrl: 'https://api.signit.example',
      authorizationKeyConfigured: true,
      webhookTokenConfigured,
      webhookTokenPrefix: tokenPrefix,
      webhookTokenCreatedAt: tokenCreatedAt,
      webhookPath,
      updatedAt: '2026-09-04T10:00:00.000Z',
    }),
  }));
  await page.route('**/api/organisations/*/modules/*/integrations/signit/webhook-token', async (route) => {
    if (route.request().method() === 'DELETE') {
      webhookTokenConfigured = false;
      tokenPrefix = null;
      tokenCreatedAt = null;
      revokeCalls += 1;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true }) });
    }
    generation += 1;
    webhookTokenConfigured = true;
    tokenPrefix = `cgw_token_${generation}`;
    tokenCreatedAt = '2026-09-04T11:00:00.000Z';
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ token: `${tokenPrefix}_secret`, webhookPath, tokenPrefix, createdAt: tokenCreatedAt }),
    });
  });

  await page.goto('/app/product/CreditGuard/application-setup/integration');
  await expect(page.getByText('Webhook token not configured')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate token' })).toBeEnabled();
  await page.getByRole('button', { name: 'Generate token' }).click();
  await expect(page.getByLabel('Generated webhook token')).toHaveValue('cgw_token_1_secret');
  await expect(page.getByText('Token cgw_token_1... is configured')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Token cgw_token_1... is configured')).toBeVisible();
  await expect(page.getByLabel('Generated webhook token')).toHaveCount(0);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Rotate token' }).click();
  await expect(page.getByLabel('Generated webhook token')).toHaveValue('cgw_token_2_secret');

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Revoke token' }).click();
  await expect.poll(() => revokeCalls).toBe(1);
  await expect(page.getByText('Webhook token not configured')).toBeVisible();
  await expect(page.getByLabel('Generated webhook token')).toHaveCount(0);
});

test('denies Integration when the admin menu grant is absent', async ({ page }) => {
  await setupAuthenticatedApp(page, { menus: [moduleUsersMenu] });

  await page.goto('/app/product/CreditGuard/application-setup/integration');

  await expect(page.getByRole('alert')).toContainText('You do not have access to Integration.');
  await expect(page.getByLabel('Authorization key')).toHaveCount(0);
});
