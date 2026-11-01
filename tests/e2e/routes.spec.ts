import { expect, test } from '@playwright/test';
import { setupAuthenticatedApp } from './support/app';

const routes = [
  ['/app/dashboard', 'Dashboard'],
  ['/app/products', 'Products'],
  ['/app/product/PRIME', 'PRIME'],
  ['/app/help', 'Help Center'],
  ['/app/resources', 'Help Center'],
  ['/account/settings', 'Account Settings'],
  ['/admin/users', 'Global Users'],
  ['/admin/user-assignments', 'User Assignments'],
  ['/admin/user-settings', 'User Settings'],
  ['/admin/organisations', 'Organisations'],
  ['/admin/connections', 'Product Database Connections'],
  ['/admin/licenses', 'Module Assignments'],
  ['/admin/settings', 'Site Settings'],
  ['/admin/roles', 'Roles'],
  ['/admin/sessions', 'Sessions'],
  ['/admin/email-logs', 'Email Delivery Logs'],
  ['/admin/email-templates', 'Email Templates'],
  ['/admin/projects', 'Projects'],
  ['/org/settings', 'Organisation Settings'],
  ['/org/teams', 'Organisation Teams'],
  ['/org/members', 'Organisation Members'],
  ['/org/projects', 'Organisation Projects'],
  ['/org/admin', 'Organisation Administrator'],
] as const;

test.beforeEach(async ({ page }) => {
  await setupAuthenticatedApp(page);
});

for (const [path, heading] of routes) {
  test(`${path} renders its primary experience`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true }).first()).toBeVisible();
  });
}

test('/app redirects to the dashboard and unknown routes return home', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/app\/dashboard$/);
  await page.goto('/not-a-route');
  await expect(page).toHaveURL(/\/$/);
});

test('CreditGuard URLs return to the product list', async ({ page }) => {
  await page.goto('/app/product/CreditGuard/requests');
  await expect(page).toHaveURL(/\/app\/products$/);
  await expect(page.getByRole('heading', { name: 'Products', exact: true })).toBeVisible();
});
