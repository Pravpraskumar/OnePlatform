import { expect, test } from '@playwright/test';
import { setupAuthenticatedApp } from './support/app';

const unauthenticatedSmtp = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Internal Relay',
  host: 'relay.example.test',
  port: 25,
  username: null,
  passwordConfigured: false,
  fromName: 'Designer Platform',
  fromEmail: 'notifications@example.test',
  secure: false,
  ignoreTlsCertificateErrors: false,
  enabled: true,
  isDefault: true,
  priority: 0,
};

test.beforeEach(async ({ page }) => {
  await setupAuthenticatedApp(page);
});

test('SMTP configuration can be saved without authentication', async ({ page }) => {
  let savedBody: { configurations: unknown[] } | undefined;
  await page.route('**/api/settings/smtp', (route) => {
    if (route.request().method() === 'PUT') {
      savedBody = route.request().postDataJSON();
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([unauthenticatedSmtp]) });
    }
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  });

  await page.goto('/admin/settings');
  await page.getByRole('button', { name: 'Add SMTP' }).click();
  await expect(page.getByLabel('Authentication')).toHaveValue('none');
  await page.getByLabel(/SMTP host/).fill(unauthenticatedSmtp.host);
  await page.getByLabel(/From name/).fill(unauthenticatedSmtp.fromName);
  await page.getByLabel(/From email/).fill(unauthenticatedSmtp.fromEmail);
  await page.getByRole('button', { name: 'Save SMTP' }).click();

  await expect.poll(() => savedBody).toMatchObject({
    configurations: [{ username: '', password: '', priority: 0, ignoreTlsCertificateErrors: false }],
  });
  await expect(page.getByText('SMTP configurations saved.')).toBeVisible();
});

test('SMTP profile can explicitly ignore TLS certificate errors', async ({ page }) => {
  let savedBody: { configurations: unknown[] } | undefined;
  await page.route('**/api/settings/smtp', (route) => {
    if (route.request().method() === 'PUT') {
      savedBody = route.request().postDataJSON();
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ ...unauthenticatedSmtp, ignoreTlsCertificateErrors: true }]) });
    }
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  });

  await page.goto('/admin/settings');
  await page.getByRole('button', { name: 'Add SMTP' }).click();
  await page.getByLabel(/SMTP host/).fill(unauthenticatedSmtp.host);
  await page.getByLabel(/From name/).fill(unauthenticatedSmtp.fromName);
  await page.getByLabel(/From email/).fill(unauthenticatedSmtp.fromEmail);
  await page.getByLabel('Ignore TLS certificate errors (unsafe)').check();
  await page.getByRole('button', { name: 'Save SMTP' }).click();

  await expect.poll(() => savedBody).toMatchObject({ configurations: [{ ignoreTlsCertificateErrors: true }] });
});

test('SMTP authentication requires both username and password', async ({ page }) => {
  let saveRequests = 0;
  await page.route('**/api/settings/smtp', (route) => {
    if (route.request().method() === 'PUT') saveRequests += 1;
    return route.fulfill({ contentType: 'application/json', body: '[]' });
  });

  await page.goto('/admin/settings');
  await page.getByRole('button', { name: 'Add SMTP' }).click();
  await page.getByLabel('Authentication').selectOption('credentials');
  await page.getByLabel(/SMTP host/).fill(unauthenticatedSmtp.host);
  await page.getByRole('textbox', { name: /^Username/ }).fill('relay-user');
  await page.getByLabel(/From name/).fill(unauthenticatedSmtp.fromName);
  await page.getByLabel(/From email/).fill(unauthenticatedSmtp.fromEmail);
  await page.getByRole('button', { name: 'Save SMTP' }).click();

  await expect(page.getByText('Provide both username and password to use SMTP authentication, or leave both blank.')).toBeVisible();
  expect(saveRequests).toBe(0);
});

test('selecting no authentication clears existing SMTP credentials', async ({ page }) => {
  let savedBody: { configurations: Array<{ username?: string; password?: string }> } | undefined;
  await page.route('**/api/settings/smtp', (route) => {
    if (route.request().method() === 'PUT') {
      savedBody = route.request().postDataJSON();
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify([unauthenticatedSmtp]) });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([{ ...unauthenticatedSmtp, username: 'relay-user', passwordConfigured: true }]),
    });
  });

  await page.goto('/admin/settings');
  await expect(page.getByLabel('Authentication')).toHaveValue('credentials');
  await page.getByLabel('Authentication').selectOption('none');
  await expect(page.getByRole('textbox', { name: /^Username/ })).toHaveCount(0);
  await page.getByRole('button', { name: 'Save SMTP' }).click();

  await expect.poll(() => savedBody?.configurations[0]).toMatchObject({ username: '', password: '' });
});