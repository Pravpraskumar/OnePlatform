import { expect, test } from '@playwright/test';
import { approver, creditGuardDetails, creditGuardRequest, setupAuthenticatedApp } from './support/app';

test.beforeEach(async ({ page }) => {
  await setupAuthenticatedApp(page);
  await page.route('**/creditguard-api/requests/request-1?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...creditGuardRequest, status: 'Reviewed', details: { ...creditGuardDetails, parentEntityType: 'localEntity' } }) }));
});

test('empty approval chains receive category defaults and remain customisable', async ({ page }) => {
  let category = { instrumentType: 'Letter of Comfort', pcgLanguage: 'Standard Description', parentEntityType: 'localEntity' };
  await page.route('**/creditguard-api/requests/request-1?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ...creditGuardRequest,
      status: 'Reviewed',
      instrumentType: category.instrumentType,
      details: { ...creditGuardDetails, pcgLanguage: category.pcgLanguage, parentEntityType: category.parentEntityType },
    }),
  }));

  const cases = [
    { name: 'Letter of Comfort with Standard Approved Wording', instrumentType: 'Letter of Comfort', pcgLanguage: 'Standard Approved Wording', parentEntityType: 'localEntity', titles: ['Local Team', 'Treasurer'] },
    { name: 'Letter of Comfort with Non-Standard Wording', instrumentType: 'Letter of Comfort', pcgLanguage: 'Non-Standard Wording', parentEntityType: 'localEntity', titles: ['Local Team', 'Legal Team', 'Treasurer'] },
    { name: 'Parent Company Guarantee with Standard Text', instrumentType: 'Parent Company Guarantee', pcgLanguage: 'Standard Text', parentEntityType: 'localEntity', titles: ['Local Team', 'Legal Team', 'VP Legal', 'VP Finance', 'Treasurer'] },
    { name: 'Parent Company Guarantee with Non-Standard Text', instrumentType: 'Parent Company Guarantee', pcgLanguage: 'Non-Standard Text', parentEntityType: 'localEntity', titles: ['Local Team', 'Legal Team', 'VP Legal', 'VP Finance', 'Treasurer'] },
    { name: 'Parent Company Guarantee [MIL] with Standard Text', instrumentType: 'Parent Company Guarantee', pcgLanguage: 'Standard Text', parentEntityType: 'mil', titles: ['Local Team', 'Legal Team', 'VP Legal', 'VP Finance', 'EXCOM', 'Chief Legal Officer', 'Chief Financial Officer', 'Treasurer'] },
    { name: 'Parent Company Guarantee [MIL] with Non-Standard Text', instrumentType: 'Parent Company Guarantee', pcgLanguage: 'Non-Standard Text', parentEntityType: 'mil', titles: ['Local Team', 'Legal Team', 'VP Legal', 'VP Finance', 'EXCOM', 'Chief Legal Officer', 'Chief Financial Officer', 'Treasurer'] },
  ];

  for (const testCase of cases) {
    category = testCase;
    await page.goto('/app/product/CreditGuard/requests/request-1/approvers');

    const rows = page.locator('tbody tr');
    await expect(rows, testCase.name).toHaveCount(testCase.titles.length);
    for (const [index, title] of testCase.titles.entries()) {
      await expect(rows.nth(index), `${testCase.name}: sequence ${index + 1}`).toContainText(title);
      await expect(rows.nth(index)).toContainText('Not assigned');
    }

    await expect(page.getByRole('button', { name: 'Add Approver' })).toBeEnabled();
    await page.getByRole('button', { name: 'Add Approver' }).click();
    await expect(rows).toHaveCount(testCase.titles.length + 1);
    await rows.last().getByRole('button', { name: /Delete/ }).click();
    await expect(rows).toHaveCount(testCase.titles.length);
  }
});

test('new unassigned approver titles persist after reopening the request', async ({ page }) => {
  let persistedRows: Array<{ id: string; sequenceOrder: number; title: string; approverId: string | null; approverName: string | null; approverEmail: string | null; approvalStatus: string }> = [];
  await page.route('**/creditguard-api/requests/request-1/approver-assignments*', async (route) => {
    if (route.request().method() === 'PUT') {
      const body = route.request().postDataJSON() as { approvers: Array<{ sequenceOrder: number; title: string; approverId: string | null }> };
      persistedRows = body.approvers.map((row) => ({ ...row, id: `saved-${row.sequenceOrder}`, approverName: null, approverEmail: null, approvalStatus: 'pending' }));
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(persistedRows) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(persistedRows) });
  });

  await page.goto('/app/product/CreditGuard/requests/request-1/approvers');
  await page.getByRole('button', { name: 'Add Approver' }).click();
  const addedRow = page.locator('tbody tr').last();
  await addedRow.getByLabel(/Approver title for sequence/).selectOption('Treasury Team');
  await expect(addedRow.getByLabel('Approver for Treasury Team')).toHaveValue('');

  await page.getByRole('button', { name: 'Save Approvers' }).click();
  await expect(page.getByText('Approvers saved successfully.')).toBeVisible();
  await page.reload();

  await expect(page.locator('tbody tr')).toHaveCount(6);
  const reopenedRow = page.locator('tbody tr').filter({ hasText: 'Treasury Team' });
  await expect(reopenedRow).toContainText('Not assigned');
});

test('requestor edits, reorders, adds, deletes, and saves the category approval chain', async ({ page }) => {
  await page.goto('/app/product/CreditGuard/requests/request-1/approvers');
  await expect(page.getByRole('heading', { name: 'Assign Approvers' })).toBeVisible();

  const requiredTitles = ['Local Team', 'Legal Team', 'VP Legal', 'VP Finance', 'Treasurer'];
  for (const [index, title] of requiredTitles.entries()) {
    const row = page.locator('tbody tr').nth(index);
    await expect(row).toContainText(title);
    await row.getByRole('button', { name: `Edit ${title}` }).click();
    await row.getByLabel(`Approver for ${title}`).selectOption(approver.id);
  }

  await page.getByRole('button', { name: 'Move Local Team down' }).click();
  await expect(page.locator('tbody tr').nth(0)).toContainText('Legal Team');
  await expect(page.locator('tbody tr').nth(1)).toContainText('Local Team');

  await page.getByRole('button', { name: 'Add Approver' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(6);
  await page.locator('tbody tr').last().getByRole('button', { name: /Delete/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(5);

  const saveRequest = page.waitForRequest((request) => request.method() === 'PUT' && request.url().endsWith('/creditguard-api/requests/request-1/approver-assignments'));
  await page.getByRole('button', { name: 'Save Approvers' }).click();

  const payload = (await saveRequest).postDataJSON();
  expect(payload.orgId).toBe('org-1');
  expect(payload.approvers).toHaveLength(5);
  expect(payload.approvers.map(({ sequenceOrder, title }: { sequenceOrder: number; title: string }) => ({ sequenceOrder, title }))).toEqual([
    { sequenceOrder: 1, title: 'Legal Team' },
    { sequenceOrder: 2, title: 'Local Team' },
    { sequenceOrder: 3, title: 'VP Legal' },
    { sequenceOrder: 4, title: 'VP Finance' },
    { sequenceOrder: 5, title: 'Treasurer' },
  ]);
  await expect(page.getByText('Approvers saved successfully.')).toBeVisible();
});

test('existing approval status, action date, and link are displayed read-only', async ({ page }) => {
  await page.route('**/creditguard-api/requests/request-1/approver-assignments?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{ id: 'assignment-1', sequenceOrder: 1, title: 'Local Team', approverId: approver.id, approverName: approver.name, approverEmail: approver.email, approvalStatus: 'approved', actionedDate: '2026-09-12T10:00:00.000Z', approvalLink: 'https://example.test/approval/1' }]),
  }));

  await page.goto('/app/product/CreditGuard/requests/request-1/approvers');

  const row = page.locator('tbody tr').filter({ hasText: 'Local Team' });
  await expect(row).toContainText('Approved');
  await expect(row).toContainText('9/12/2026');
  await expect(row.getByRole('link', { name: 'Open' })).toHaveAttribute('href', 'https://example.test/approval/1');
  await expect(page.getByText('This approval chain can no longer be changed because an approver has actioned it.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Approver' })).toBeDisabled();
  await expect(row.getByRole('button', { name: 'Edit Local Team' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save Approvers' })).toBeDisabled();
});

test('requestor finalizes the saved chain and an administrator can unlock it while Reviewed', async ({ page }) => {
  let finalized = false;
  const assignments = ['Local Team', 'Legal Team', 'VP Legal', 'VP Finance', 'Treasurer'].map((title, index) => ({
    id: `assignment-${index + 1}`,
    sequenceOrder: index + 1,
    title,
    approverId: approver.id,
    approverName: approver.name,
    approverEmail: approver.email,
    approvalStatus: 'pending',
  }));
  await page.route('**/creditguard-api/requests/request-1?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      ...creditGuardRequest,
      status: 'Reviewed',
      approversFinalizedAt: finalized ? '2026-09-14T10:00:00.000Z' : null,
      approversFinalizedByUserId: finalized ? 'user-1' : null,
      details: { ...creditGuardDetails, parentEntityType: 'localEntity' },
    }),
  }));
  await page.route('**/creditguard-api/requests/request-1/approver-assignments?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(assignments) }));
  await page.route('**/creditguard-api/requests/request-1/approver-assignments/finalize', (route) => {
    finalized = true;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...creditGuardRequest, status: 'Reviewed', approversFinalizedAt: '2026-09-14T10:00:00.000Z', approversFinalizedByUserId: 'user-1' }) });
  });
  await page.route('**/creditguard-api/requests/request-1/approver-assignments/modify', (route) => {
    finalized = false;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...creditGuardRequest, status: 'Reviewed', approversFinalizedAt: null, approversFinalizedByUserId: null }) });
  });

  await page.goto('/app/product/CreditGuard/requests/request-1/approvers');
  await page.getByRole('button', { name: 'Finalize' }).click();
  const warning = page.getByRole('alertdialog', { name: 'Finalize approval chain?' });
  await expect(warning).toContainText('approver list will be frozen');
  await warning.getByRole('button', { name: 'Keep editing' }).click();
  await expect(warning).toHaveCount(0);

  await page.getByRole('button', { name: 'Finalize' }).click();
  await page.getByRole('button', { name: 'Finalize and lock' }).click();
  await expect(page.getByText('This approval chain is finalized and frozen.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Approver' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save Approvers' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Edit Local Team' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Modify' })).toBeEnabled();

  await page.getByRole('button', { name: 'Modify' }).click();
  await expect(page.getByText('This approval chain is finalized and frozen.')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add Approver' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Finalize' })).toBeEnabled();
});

test('Modify is hidden from non-admins after finalization', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('platformAuthUser', JSON.stringify({ id: 'user-1', email: 'requestor@example.test', displayName: 'Requestor', globalRoles: [] }));
    localStorage.setItem('selectedOrgId', JSON.stringify({ id: 'org-1', name: 'Organisation', slug: 'organisation', status: 'active', membership: 'Member' }));
  });
  await page.route('**/creditguard-api/requests/request-1?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ...creditGuardRequest, status: 'Approved', approversFinalizedAt: '2026-09-14T10:00:00.000Z', approversFinalizedByUserId: 'user-1', details: creditGuardDetails }),
  }));

  await page.goto('/app/product/CreditGuard/requests/request-1/approvers');
  await expect(page.getByRole('button', { name: 'Modify' })).toHaveCount(0);
});

test('Finalize is hidden from an organisation member who is not the requestor', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('platformAuthUser', JSON.stringify({ id: 'member-1', email: 'member@example.test', displayName: 'Member', globalRoles: [] }));
    localStorage.setItem('selectedOrgId', JSON.stringify({ id: 'org-1', name: 'Organisation', slug: 'organisation', status: 'active', membership: 'Member' }));
  });
  await page.route('**/creditguard-api/requests/request-1?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ...creditGuardRequest, status: 'Reviewed', requestedByUserId: 'requestor-1', approversFinalizedAt: null, details: creditGuardDetails }),
  }));

  await page.goto('/app/product/CreditGuard/requests/request-1/approvers');
  await expect(page.getByRole('button', { name: 'Finalize' })).toHaveCount(0);
});

test('Modify is disabled when a finalized request is no longer Reviewed', async ({ page }) => {
  await page.route('**/creditguard-api/requests/request-1?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ ...creditGuardRequest, status: 'Approved', approversFinalizedAt: '2026-09-14T10:00:00.000Z', approversFinalizedByUserId: 'user-1', details: creditGuardDetails }),
  }));

  await page.goto('/app/product/CreditGuard/requests/request-1/approvers');
  await expect(page.getByRole('button', { name: 'Modify' })).toBeDisabled();
});