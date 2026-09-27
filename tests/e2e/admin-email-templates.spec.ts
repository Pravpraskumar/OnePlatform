import { expect, test } from '@playwright/test';
import { setupAuthenticatedApp } from './support/app';

test.beforeEach(async ({ page }) => {
  await setupAuthenticatedApp(page);
});

test('global administrator edits an event template and inserts an allowed placeholder', async ({ page }) => {
  await page.goto('/admin/email-templates');

  await expect(page.getByRole('heading', { name: 'Email Templates' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Request Review' })).toBeVisible();
  await page.getByLabel('Subject').fill('Review required: ');
  await page.getByRole('button', { name: 'Insert requestNumber placeholder' }).click();
  await page.getByLabel('Body').fill('Hello {{recipientName}}, please review {{requestNumber}}.');

  const requestPromise = page.waitForRequest((request) =>
    request.method() === 'PUT' && request.url().endsWith('/api/notifications/email-templates/template-1'),
  );
  await page.getByRole('button', { name: 'Save template' }).click();
  const request = await requestPromise;

  expect(request.postDataJSON()).toEqual({
    subjectTemplate: 'Review required: {{requestNumber}}',
    bodyTemplate: 'Hello {{recipientName}}, please review {{requestNumber}}.',
  });
});

test('template validation failure remains visible to the administrator', async ({ page }) => {
  await page.route('**/api/notifications/email-templates/template-1', (route) => route.fulfill({
    status: 400,
    contentType: 'application/json',
    body: JSON.stringify({ message: 'Unknown email template placeholders: unsupported' }),
  }));
  await page.goto('/admin/email-templates');
  await page.getByLabel('Subject').fill('Review {{unsupported}}');
  await page.getByRole('button', { name: 'Save template' }).click();

  await expect(page.locator('main').getByRole('alert')).toContainText('Unknown email template placeholders: unsupported');
});