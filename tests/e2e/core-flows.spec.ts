import { expect, test } from '@playwright/test';
import { creditGuardRequest, organisation, products, setupAuthenticatedApp } from './support/app';

test.beforeEach(async ({ page }) => {
  await setupAuthenticatedApp(page);
});

test('dashboard restores organisation context and products open a licensed module', async ({ page }) => {
  await page.goto('/app/dashboard');
  await expect(page.getByText(`Active organisation: ${organisation.name}`)).toBeVisible();
  await page.getByRole('link', { name: 'Products' }).first().click();
  await expect(page.getByText(products[0].description)).toBeVisible();
  await expect(page.getByRole('link', { name: /CreditGuard Financial security workflow/ })).toHaveAttribute('href', '/app/product/CreditGuard');
  await page.goto('/app/product/CreditGuard');
  await expect(page.getByRole('heading', { name: 'CreditGuard Process Guide' })).toBeVisible();
});

test('a concurrent-seat rejection blocks product entry with a useful message', async ({ page }) => {
  await page.route('**/api/sessions', (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"Concurrent seat limit reached"}' }),
  );
  await page.goto('/app/product/CreditGuard');
  await expect(page.getByRole('heading', { name: 'Unable to open CreditGuard' })).toBeVisible();
  await expect(page.getByText(/No CreditGuard seats are currently available/)).toBeVisible();
});

test('request list identifies MIL parent company guarantees and supports Notes-only inline editing and deletion', async ({ page }) => {
  let patchBody: unknown;
  await page.route('**/creditguard-api/requests?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ ...creditGuardRequest, status: 'Draft', parentEntityType: 'mil' }]) }));
  await page.route('**/creditguard-api/requests/request-1', async (route) => {
    if (route.request().method() === 'PATCH') {
      patchBody = route.request().postDataJSON();
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...creditGuardRequest, ...patchBody }) });
    }
    return route.fulfill({ contentType: 'application/json', body: '{}' });
  });

  await page.goto('/app/product/CreditGuard/requests');
  const requestLink = page.getByRole('link', { name: 'CG-1001' });
  await expect(requestLink).toHaveAttribute('href', '/app/product/CreditGuard/requests/request-1/edit');
  await expect(page.getByRole('cell', { name: 'Parent Company Guarantee - MIL', exact: true })).toBeVisible();
  await page.getByPlaceholder('Filter Request No.').fill('missing');
  await expect(page.getByText('CG-1001')).toBeHidden();
  await page.getByPlaceholder('Filter Request No.').fill('');

  await page.getByTitle('Edit notes').click();
  await expect(page.getByLabel('Notes for CG-1001')).toHaveCount(1);
  await page.getByLabel('Notes for CG-1001').fill('Updated request note');
  await page.getByTitle('Save').click();
  await expect.poll(() => patchBody).toMatchObject({
    requestNumber: 'CG-1001',
    notes: 'Updated request note',
  });

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTitle('Delete').click();
  await expect(page.getByText('CG-1001')).toBeHidden();
});

test('Assign Approvers is enabled only for a selected Reviewed request', async ({ page }) => {
  await page.route('**/creditguard-api/requests?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ ...creditGuardRequest, status: 'Reviewed' }]) }));
  await page.goto('/app/product/CreditGuard/requests');

  await expect(page.getByRole('button', { name: 'Assign Approvers' })).toBeDisabled();
  const requestRow = page.locator('tbody tr').filter({ hasText: 'CG-1001' });
  await requestRow.getByRole('cell', { name: creditGuardRequest.beneficiary }).click();
  await expect(requestRow).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Select request CG-1001')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Assign Approvers' })).toBeEnabled();
  await requestRow.getByRole('cell', { name: creditGuardRequest.beneficiary }).click();
  await expect(requestRow).toHaveAttribute('aria-selected', 'false');
  await expect(page.getByRole('button', { name: 'Assign Approvers' })).toBeDisabled();
  await requestRow.getByRole('cell', { name: creditGuardRequest.beneficiary }).click();
  await page.getByRole('button', { name: 'Assign Approvers' }).click();
  await expect(page).toHaveURL(/\/requests\/request-1\/approvers$/);
});

test('request reports aggregate the current portfolio', async ({ page }) => {
  const browserToday = await page.evaluate(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth(), day: today.getDate() };
  });
  const currentQuarterMonth = Math.floor(browserToday.month / 3) * 3;
  const currentQuarterDate = `${browserToday.year}-${String(browserToday.month + 1).padStart(2, '0')}-${String(browserToday.day).padStart(2, '0')}`;
  const nextQuarterStart = new Date(Date.UTC(browserToday.year, currentQuarterMonth + 4, 15)).toISOString().slice(0, 10);
  await page.route('**/requests?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([
      { ...creditGuardRequest, parentEntityType: 'mil', status: 'Issued', nextReviewDate: currentQuarterDate, guaranteeByEntities: ['McDermott International Limited'] },
      { ...creditGuardRequest, parentEntityType: 'mil', id: 'request-2', requestNumber: 'CG-1002', amount: 125000, status: 'Approved', nextReviewDate: nextQuarterStart, guaranteeByEntities: ['McDermott International Limited'] },
      { ...creditGuardRequest, parentEntityType: 'localEntity', id: 'request-3', requestNumber: 'CG-1003', amount: 80000, currency: 'EUR', status: 'Approved', nextReviewDate: nextQuarterStart, guaranteeByEntities: ['McDermott Investments, LLC'] },
      { ...creditGuardRequest, parentEntityType: 'localEntity', id: 'request-4', requestNumber: 'CG-1004', amount: 999000, status: 'Closed', nextReviewDate: nextQuarterStart, guaranteeByEntities: ['Closed Entity'] },
    ]),
  }));
  await page.goto('/app/product/CreditGuard/reports');
  await expect(page.getByRole('heading', { name: 'Reports & Analytics' })).toBeVisible();
  await expect(page.getByText('Total requests').locator('..').getByText('4')).toBeVisible();
  await expect(page.getByText('Approved Requests').locator('..').getByText('2')).toBeVisible();
  await expect(page.getByText('Instrument types')).toHaveCount(0);
  const instrumentSummary = page.getByRole('heading', { name: 'Requests by instrument' }).locator('..');
  await expect(instrumentSummary.getByText('Parent Company Guarantee - MIL', { exact: true }).locator('..').getByText('2')).toBeVisible();
  await expect(instrumentSummary.getByText('Parent Company Guarantee', { exact: true }).locator('..').getByText('2')).toBeVisible();
  const entityTable = page.getByRole('heading', { name: 'Guarantees by entity' }).locator('..').locator('..');
  await expect(entityTable).toContainText('McDermott International Limited');
  await expect(entityTable).toContainText('375,000');
  await expect(entityTable).not.toContainText('Closed Entity');
  const reviewTable = page.getByRole('heading', { name: 'Upcoming guarantee reviews' }).locator('..').locator('..');
  await expect(reviewTable).toContainText('USD 250,000');
  await expect(reviewTable).toContainText('USD 125,000');
  await expect(reviewTable).toContainText('EUR 80,000');
  await expect(reviewTable).not.toContainText('999,000');
});

test('business entities can be searched, created, edited, and deleted', async ({ page }) => {
  await page.goto('/app/product/CreditGuard/application-setup/business-entities');
  await expect(page.getByText('Designer Energy LLC')).toBeVisible();
  await page.getByPlaceholder('Search business entities').fill('does-not-exist');
  await expect(page.getByText('Designer Energy LLC')).toBeHidden();
  await page.getByPlaceholder('Search business entities').fill('');

  await page.getByRole('button', { name: 'Add entity' }).click();
  const newRow = page.locator('tbody tr').first();
  const inputs = newRow.locator('input');
  await inputs.nth(0).fill('200');
  await inputs.nth(1).fill('UK');
  await inputs.nth(2).fill('Designer UK Ltd');
  await newRow.getByTitle('Save').click();
  await expect(page.getByText('Designer UK Ltd')).toBeVisible();

  const existingRow = page.locator('tbody tr').first();
  await expect(existingRow).toContainText('Designer Energy LLC');
  await existingRow.getByTitle('Edit').click();
  await existingRow.locator('input').nth(2).fill('Designer Energy Inc');
  await existingRow.getByTitle('Save').click();
  await expect(page.getByText('Designer Energy Inc')).toBeVisible();

  page.once('dialog', (dialog) => dialog.accept());
  await existingRow.getByTitle('Delete').click();
  await expect(page.getByText('Designer Energy Inc')).toBeHidden();
});
