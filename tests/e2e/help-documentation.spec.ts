import { expect, test } from '@playwright/test';
import { setupAuthenticatedApp } from './support/app';

test.beforeEach(async ({ page }) => {
  await setupAuthenticatedApp(page);
});

test('CreditGuard Requests opens its isolated contextual help and returns to the screen', async ({ page }) => {
  await page.goto('/app/product/CreditGuard/requests');
  await page.locator('header nav').getByRole('link', { name: 'Open help for this screen' }).click();

  await expect(page).toHaveURL(/\/app\/help\/creditguard-requests$/);
  await expect(page.getByRole('heading', { name: 'Request register', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Work with the register' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to screen' }).click();
  await expect(page).toHaveURL(/\/app\/product\/CreditGuard\/requests$/);
});

test('Email Templates opens email delivery help instead of a generic topic', async ({ page }) => {
  await page.goto('/admin/email-templates');
  await page.locator('header nav').getByRole('link', { name: 'Open help for this screen' }).click();

  await expect(page).toHaveURL(/\/app\/help\/global-email$/);
  await expect(page.getByRole('heading', { name: 'Email templates and delivery', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Email Templates', exact: true })).toBeVisible();
});

test('Help Center searches isolated topics and preserves the Resources bookmark', async ({ page }) => {
  await page.goto('/app/resources');
  await expect(page).toHaveURL(/\/app\/help$/);
  await expect(page.getByRole('heading', { name: 'Help Center' })).toBeVisible();

  await page.getByPlaceholder('Search help topics').fill('licensed seat');
  await expect(page.getByRole('link', { name: 'Products, projects, and sessions', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Assign approvers/ })).toHaveCount(0);
});

test('contextual Help remains directly available on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/product/CreditGuard/reports');
  await page.locator('header a[aria-label="Open help for this screen"]:visible').click();

  await expect(page).toHaveURL(/\/app\/help\/creditguard-reports$/);
  await expect(page.getByRole('heading', { name: 'Reports and analytics', exact: true })).toBeVisible();
});