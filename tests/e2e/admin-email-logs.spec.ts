import { expect, test } from '@playwright/test';
import { emailDeliveryLog, setupAuthenticatedApp } from './support/app';

test.beforeEach(async ({ page }) => {
  await setupAuthenticatedApp(page);
});

test('global administrator can review and filter email delivery logs', async ({ page }) => {
  await page.goto('/admin/email-logs');

  await expect(page.getByRole('heading', { name: 'Email Delivery Logs' })).toBeVisible();
  await expect(page.getByRole('table').getByText(emailDeliveryLog.module, { exact: true })).toBeVisible();
  await expect(page.getByText(emailDeliveryLog.eventType)).toBeVisible();
  await expect(page.getByText(emailDeliveryLog.recipientEmail)).toBeVisible();
  await expect(page.getByText(emailDeliveryLog.smtpConfigurationName)).toBeVisible();
  await expect(page.getByRole('table').getByText('Sent', { exact: true })).toBeVisible();

  const filteredRequest = page.waitForRequest((request) => request.url().includes('/api/notifications/email-logs?module=CreditGuard'));
  await page.getByLabel('Module').selectOption('CreditGuard');
  await filteredRequest;
});

test('global administrator can retry a failed email', async ({ page }) => {
  const failedLog = {
    ...emailDeliveryLog,
    id: '00000000-0000-4000-8000-000000000001',
    status: 'Failed',
    providerMessageId: null,
    errorMessage: 'Connection refused\nCode: ECONNREFUSED\nNetwork operation: connect\nServer: 127.0.0.1:587',
    sentAt: null,
  };
  let logs = [failedLog];
  await page.route('**/api/notifications/email-logs**', (route) => {
    if (route.request().method() === 'POST') {
      logs = [{ ...failedLog, id: '00000000-0000-4000-8000-000000000002', status: 'Sent', errorMessage: null }];
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'sent', logId: logs[0].id }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(logs) });
  });

  await page.goto('/admin/email-logs');
  await page.getByText('Error details').click();
  await expect(page.getByText('Code: ECONNREFUSED')).toBeVisible();
  await expect(page.getByText('Network operation: connect')).toBeVisible();
  await expect(page.getByText('Server: 127.0.0.1:587')).toBeVisible();
  const retryRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith(`/api/notifications/email-logs/${failedLog.id}/retry`));
  await page.getByRole('button', { name: `Retry email to ${failedLog.recipientEmail}` }).click();

  await retryRequest;
  await expect(page.getByText(`Email resent to ${failedLog.recipientEmail}.`)).toBeVisible();
  await expect(page.getByRole('table').getByText('Sent', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Retry email/ })).toHaveCount(0);
});