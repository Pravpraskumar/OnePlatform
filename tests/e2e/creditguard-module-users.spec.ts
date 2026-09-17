import { expect, test } from '@playwright/test';
import { approver, organisation, setupAuthenticatedApp } from './support/app';

test.beforeEach(async ({ page }) => {
  await setupAuthenticatedApp(page);
});

test('module users defaults to approvers and filters registered users by assigned role', async ({ page }) => {
  let createBody: unknown;
  let updateBody: unknown;
  let deleteOrgId = '';

  await page.route('**/creditguard-api/approvers', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    createBody = route.request().postDataJSON();
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...approver, ...createBody, id: 'approver-new' }) });
  });
  await page.route('**/creditguard-api/approvers/approver-1', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    updateBody = route.request().postDataJSON();
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...approver, ...updateBody }) });
  });
  await page.route('**/creditguard-api/approvers/approver-1?*', async (route) => {
    deleteOrgId = new URL(route.request().url()).searchParams.get('orgId') ?? '';
    return route.fulfill({ contentType: 'application/json', body: '{"ok":true}' });
  });

  await page.goto('/app/product/CreditGuard/application-setup/module-users');
  await expect(page.getByRole('heading', { name: 'Module Users' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Approvers' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(approver.name)).toBeVisible();

  await page.getByRole('tab', { name: 'Registered Users' }).click();
  await expect(page.getByRole('cell', { name: 'Ada Admin' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Riley Reviewer' })).toBeVisible();
  await expect(page.getByTitle('Edit designation')).toHaveCount(0);
  await page.getByLabel('Filter registered users by role').selectOption('CreditGuard Reviewer');
  await expect(page.getByRole('cell', { name: 'Riley Reviewer' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Ada Admin' })).toHaveCount(0);

  await page.getByRole('tab', { name: 'Approvers' }).click();
  await page.getByRole('button', { name: 'Add approver' }).click();
  await expect(page.getByTitle('Save approver')).toBeDisabled();
  await page.getByLabel('Approver name').fill('Morgan Finance');
  await page.getByLabel('Approver email').fill('morgan@example.test');
  await page.getByTitle('Save approver').click();
  await expect.poll(() => createBody).toEqual({ name: 'Morgan Finance', email: 'morgan@example.test', orgId: organisation.id });
  await expect(page.getByText('Morgan Finance')).toBeVisible();

  const existingRow = page.locator('tbody tr').filter({ hasText: approver.email });
  await existingRow.getByTitle('Edit approver').click();
  await page.getByLabel('Approver name').fill('Taylor Finance Approver');
  await page.getByTitle('Save approver').click();
  await expect.poll(() => updateBody).toEqual({ name: 'Taylor Finance Approver', email: approver.email, orgId: organisation.id });
  await expect(page.getByText('Taylor Finance Approver')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('tbody tr').filter({ hasText: approver.email }).getByTitle('Delete approver').click();
  await expect.poll(() => deleteOrgId).toBe(organisation.id);
  await expect(page.getByText('Taylor Finance Approver')).toBeHidden();
});

test('duplicate approver errors remain visible and do not create a row', async ({ page }) => {
  await page.route('**/creditguard-api/approvers', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    return route.fulfill({ status: 409, contentType: 'application/json', body: '{"message":"An approver with this email already exists for the organisation"}' });
  });

  await page.goto('/app/product/CreditGuard/application-setup/module-users');
  await page.getByRole('tab', { name: 'Approvers' }).click();
  await page.getByRole('button', { name: 'Add approver' }).click();
  await page.getByLabel('Approver name').fill('Duplicate Approver');
  await page.getByLabel('Approver email').fill(approver.email);
  await page.getByTitle('Save approver').click();

  await expect(page.getByText(/already exists for the organisation/)).toBeVisible();
  await expect(page.getByLabel('Approver name')).toHaveValue('Duplicate Approver');
});
