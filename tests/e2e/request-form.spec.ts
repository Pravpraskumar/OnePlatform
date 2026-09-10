import { expect, test } from '@playwright/test';
import { setupAuthenticatedApp } from './support/app';

test.beforeEach(async ({ page }) => {
  await setupAuthenticatedApp(page);
});

async function selectRequiredEntities(page: import('@playwright/test').Page) {
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: 'Select a business entity' }).first().click();
    await page.getByRole('button', { name: /100 - Designer Energy LLC/ }).click();
  }
}

test('new request captures initial data only and saves a Draft', async ({ page }) => {
  await page.goto('/app/product/CreditGuard/requests/new');

  const newRequestHeading = page.getByRole('heading', { name: 'New Company Guarantee Request' });
  await expect(newRequestHeading).toBeVisible();
  await expect(newRequestHeading.locator('xpath=ancestor::header')).toHaveClass(/bg-gradient-to-r/);
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveClass(/bg-white/);
  await expect(page.getByRole('button', { name: 'Save Draft' })).toHaveClass(/bg-blue-700/);
  await expect(page.getByRole('heading', { name: 'Requesting division and approvals' })).toHaveCount(0);
  await expect(page.getByLabel('Attachments')).toHaveCount(0);
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();

  await page.getByLabel('Date required by').fill('2026-12-31');
  await selectRequiredEntities(page);
  await page.getByLabel('Proposal/contract reference number and name').fill('PCG-NEW-001');
  await page.getByRole('button', { name: 'Award' }).click();
  await page.getByLabel('Beneficiary name').fill('Example Beneficiary');
  await page.getByLabel('Beneficiary address').fill('100 Example Street, Houston, TX 77002');
  await page.getByLabel(/^Contract value/).fill('500000');
  await page.getByLabel('Background on requirement for guarantee').fill('Required for the awarded contract.');
  await page.getByLabel('Brief description of project/undertaking').fill('Example offshore project.');

  const createRequest = page.waitForRequest((request) =>
    request.method() === 'POST' && request.url().endsWith('/creditguard-api/requests'),
  );
  await page.getByRole('button', { name: 'Save Draft' }).click();

  const payload = (await createRequest).postDataJSON();
  expect(payload).toMatchObject({
    status: 'Draft',
    beneficiary: 'Example Beneficiary',
    details: {
      proposalContractReference: 'PCG-NEW-001',
      beneficiaryAddress: '100 Example Street, Houston, TX 77002',
      requesterName: 'Ada Admin',
      legalLanguageConfirmed: false,
    },
  });
  await expect(page).toHaveURL(/\/app\/product\/CreditGuard\/requests\/request-new\/edit$/);
});

test('edit request loads approvals, persists details, and keeps actions visible', async ({ page }) => {
  await page.goto('/app/product/CreditGuard/requests/request-1/edit');

  await expect(page.getByRole('heading', { name: 'Edit Company Guarantee Request' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Requesting division and approvals' })).toBeVisible();
  await expect(page.getByLabel('Proposal/contract reference number and name')).toHaveValue('PCG-1001');
  await expect(page.getByLabel('Beneficiary name')).toHaveValue('Example Client');
  await expect(page.getByLabel('Beneficiary address')).toHaveValue('100 Example Street, Houston, TX 77002');

  const main = page.locator('main');
  await main.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();

  await page.getByLabel('BL Finance VP - name and title').fill('Updated Finance VP');
  const updateRequest = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith('/creditguard-api/requests/request-1'),
  );
  await page.getByRole('button', { name: 'Save changes' }).click();

  const payload = (await updateRequest).postDataJSON();
  expect(payload).toMatchObject({
    status: 'Under Review',
    details: {
      blFinanceVpNameTitle: 'Updated Finance VP',
      legalLanguageConfirmed: true,
    },
  });
  await expect(page).toHaveURL(/\/app\/product\/CreditGuard\/requests\/request-1\/edit$/);
});
