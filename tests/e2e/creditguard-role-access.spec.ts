import { expect, test } from '@playwright/test';
import type { MenuNode } from '@platform/shared';
import { setupAuthenticatedApp } from './support/app';

function menu(id: string, name: string, route: string | null, children: MenuNode[] = []): MenuNode {
  return {
    id,
    parentId: null,
    name,
    route,
    icon: 'shield-check',
    type: 'Secured',
    productId: 'product-cg',
    displayOrder: 1,
    isActive: true,
    accessMode: route === '/app/product/CreditGuard/requests' ? 'editable' : 'readonly',
    children,
  };
}

const overview = menu('creditguard-overview', 'Overview', '/app/product/CreditGuard');
const requests = menu('creditguard-requests', 'Requests', '/app/product/CreditGuard/requests');
const reports = menu('creditguard-reports', 'Reports', '/app/product/CreditGuard/reports');

test('General User has workspace access without products or modules', async ({ page }) => {
  await setupAuthenticatedApp(page, {
    currentUser: {
      id: 'basic-user',
      b2cOid: 'oidc:basic-user',
      email: 'basic.user@example.test',
      displayName: 'Basic User',
      globalRoles: ['General User'],
    },
    menus: [],
  });
  await page.route('**/api/products?*', (route) => route.fulfill({ contentType: 'application/json', body: '[]' }));

  await page.goto('/app/products');
  await expect(page.getByText('No modules are assigned to this organisation.')).toBeVisible();

  await page.goto('/app/product/CreditGuard');
  await expect(page.getByRole('heading', { name: 'Unable to open CreditGuard' })).toBeVisible();
  await expect(page.getByText('This module is not assigned to the selected organisation.')).toBeVisible();
});

test('CreditGuard Requestor receives request screens without reviewer or setup screens', async ({ page }) => {
  await setupAuthenticatedApp(page, {
    menus: [menu('creditguard', 'CreditGuard', null, [overview, requests])],
  });

  await page.goto('/app/dashboard');

  await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Requests' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reports' })).toHaveCount(0);
  await expect(page.getByText('Application Setup', { exact: true })).toHaveCount(0);
});

test('CreditGuard Reviewer receives request and report screens without setup screens', async ({ page }) => {
  await setupAuthenticatedApp(page, {
    menus: [menu('creditguard', 'CreditGuard', null, [overview, requests, reports])],
  });

  await page.goto('/app/dashboard');

  await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Requests' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Reports' })).toBeVisible();
  await expect(page.getByText('Application Setup', { exact: true })).toHaveCount(0);
});

test('sidebar reloads CreditGuard menus after access changes', async ({ page }) => {
  let accessGranted = false;
  const creditGuardMenus = [menu('creditguard', 'CreditGuard', null, [overview, requests])];
  await setupAuthenticatedApp(page, { menus: [] });
  await page.route('**/api/menus/mine?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(accessGranted ? creditGuardMenus : []),
  }));

  await page.goto('/app/dashboard');
  await expect(page.getByRole('link', { name: 'Requests' })).toHaveCount(0);

  accessGranted = true;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));

  await expect(page.getByRole('link', { name: 'Requests' })).toBeVisible();
});