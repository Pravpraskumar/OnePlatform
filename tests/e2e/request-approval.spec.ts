import { expect, test } from '@playwright/test';
import { approver, creditGuardAttachment, creditGuardDetails, creditGuardRequest, setupAuthenticatedApp } from './support/app';

test.beforeEach(async ({ page }) => {
  await setupAuthenticatedApp(page);
});

test('opens a Reviewed request and sends selected PDFs to Signit for approval', async ({ page }) => {
  const reviewedRequest = {
    ...creditGuardRequest,
    status: 'Reviewed',
    approversFinalizedAt: '2026-09-14T10:00:00.000Z',
    approversFinalizedByUserId: 'user-1',
    signitEnvelopeId: null,
    approvalInitiatedAt: null,
    details: creditGuardDetails,
  };
  const assignments = [{
    id: 'assignment-1',
    sequenceOrder: 1,
    title: 'Local Team',
    approverId: approver.id,
    approverName: approver.name,
    approverEmail: approver.email,
    approvalStatus: 'pending',
    actionedDate: null,
    approvalLink: null,
  }];
  let initiateBody: unknown;
  let distributed = false;

  await page.route('**/creditguard-api/requests?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([reviewedRequest]) }));
  await page.route('**/creditguard-api/requests/request-1?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(reviewedRequest) }));
  await page.route('**/creditguard-api/requests/request-1/attachments?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([creditGuardAttachment, { ...creditGuardAttachment, id: 'docx-1', originalFileName: 'notes.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }]) }));
  await page.route('**/creditguard-api/requests/request-1/approver-assignments?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify(assignments.map((assignment) => ({
      ...assignment,
      approvalLink: distributed ? 'https://signit.example/sign/recipient-1' : null,
    }))),
  }));
  await page.route('**/creditguard-api/requests/request-1/initiate-approval', (route) => {
    initiateBody = route.request().postDataJSON();
    distributed = true;
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ...reviewedRequest, status: 'Sent for Approval', signitEnvelopeId: 'env-signit-123', approvalInitiatedAt: '2026-09-15T10:00:00.000Z' }),
    });
  });

  await page.goto('/app/product/CreditGuard/requests');
  await page.locator('tbody tr').filter({ hasText: reviewedRequest.requestNumber }).getByRole('cell', { name: reviewedRequest.beneficiary }).click();
  await page.getByRole('button', { name: 'Initiate Approval' }).click();

  await expect(page.getByRole('heading', { name: 'Initiate Approval' })).toBeVisible();
  await expect(page.getByText(reviewedRequest.instrumentType)).toBeVisible();
  await expect(page.getByText(reviewedRequest.beneficiary)).toBeVisible();
  await expect(page.getByText('guarantee.pdf')).toBeVisible();
  await expect(page.getByText('notes.docx')).toHaveCount(0);
  await expect(page.getByText(approver.name)).toBeVisible();

  const sendButton = page.getByRole('button', { name: 'Send to Signit for Approval' });
  await expect(sendButton).toBeDisabled();
  await page.getByLabel('guarantee.pdf').check();
  await expect(sendButton).toBeEnabled();
  await sendButton.click();

  await expect.poll(() => initiateBody).toEqual({ orgId: 'org-1', productId: 'product-cg', attachmentIds: ['attachment-1'] });
  await expect(page.getByRole('heading', { name: 'Approval Status' })).toBeVisible();
  await expect(page.getByText('env-signit-123')).toBeVisible();
  await expect(page.getByText('Sent to Signit', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open' })).toHaveAttribute('href', 'https://signit.example/sign/recipient-1');
});

test('hides approval action for Draft and Under Review, then labels it Approval Status after sending', async ({ page }) => {
  for (const status of ['Draft', 'Under Review']) {
    await page.route('**/creditguard-api/requests?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ ...creditGuardRequest, status }]) }), { times: 1 });
    await page.goto('/app/product/CreditGuard/requests');
    await page.locator('tbody tr').filter({ hasText: creditGuardRequest.requestNumber }).getByRole('cell', { name: creditGuardRequest.beneficiary }).click();
    await expect(page.getByRole('button', { name: 'Initiate Approval' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Approval Status' })).toHaveCount(0);
  }

  await page.route('**/creditguard-api/requests?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([{ ...creditGuardRequest, status: 'Sent for Approval' }]) }));
  await page.goto('/app/product/CreditGuard/requests');
  await page.locator('tbody tr').filter({ hasText: creditGuardRequest.requestNumber }).getByRole('cell', { name: creditGuardRequest.beneficiary }).click();
  await expect(page.getByRole('button', { name: 'Approval Status' })).toBeVisible();
});

test('refreshes the Signit envelope and recipient signing status', async ({ page }) => {
  const sentRequest = {
    ...creditGuardRequest,
    status: 'Sent for Approval',
    approversFinalizedAt: '2026-09-14T10:00:00.000Z',
    signitEnvelopeId: 'envelope-abc123',
    approvalInitiatedAt: '2026-09-15T10:00:00.000Z',
    details: creditGuardDetails,
  };
  const signedAt = '2026-09-15T11:30:00.000Z';
  let refreshed = false;
  let refreshBody: unknown;
  const assignment = {
    id: 'assignment-1',
    sequenceOrder: 1,
    title: 'Local Team',
    approverId: approver.id,
    approverName: approver.name,
    approverEmail: approver.email,
    approvalLink: 'https://signit.example/sign/recipient-1',
  };

  await page.route('**/creditguard-api/requests/request-1?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(sentRequest) }));
  await page.route('**/creditguard-api/requests/request-1/attachments?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([creditGuardAttachment]) }));
  await page.route('**/creditguard-api/requests/request-1/approver-assignments?*', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify([{ ...assignment, approvalStatus: refreshed ? 'approved' : 'pending', actionedDate: refreshed ? signedAt : null }]),
  }));
  await page.route('**/creditguard-api/requests/request-1/refresh-approval', (route) => {
    refreshBody = route.request().postDataJSON();
    refreshed = true;
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ title: 'Service Agreement', status: 'COMPLETED' }) });
  });

  await page.goto('/app/product/CreditGuard/requests/request-1/approval');
  await expect(page.getByText('pending', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh' }).click();

  await expect.poll(() => refreshBody).toEqual({ orgId: 'org-1', productId: 'product-cg' });
  await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible();
  await expect(page.getByText('approved', { exact: true })).toBeVisible();
  await expect(page.getByText(new Date(signedAt).toLocaleString(), { exact: true })).toBeVisible();
});

test('an administrator can recall a Signit envelope only after Signit confirms deletion', async ({ page }) => {
  const sentRequest = {
    ...creditGuardRequest,
    status: 'Sent for Approval',
    approversFinalizedAt: '2026-09-14T10:00:00.000Z',
    signitEnvelopeId: 'envelope-abc123',
    approvalInitiatedAt: '2026-09-15T10:00:00.000Z',
    details: creditGuardDetails,
  };
  const assignments = [{
    id: 'assignment-1',
    sequenceOrder: 1,
    title: 'Local Team',
    approverId: approver.id,
    approverName: approver.name,
    approverEmail: approver.email,
    approvalStatus: 'pending',
    actionedDate: null,
    approvalLink: null,
  }];
  let recallAttempts = 0;
  let recallBody: unknown;

  await page.route('**/creditguard-api/requests/request-1?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(sentRequest) }));
  await page.route('**/creditguard-api/requests/request-1/attachments?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify([creditGuardAttachment]) }));
  await page.route('**/creditguard-api/requests/request-1/approver-assignments?*', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify(assignments) }));
  await page.route('**/creditguard-api/requests/request-1/recall-approval', (route) => {
    recallAttempts += 1;
    recallBody = route.request().postDataJSON();
    if (recallAttempts === 1) {
      return route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ message: 'Signit did not confirm the envelope recall' }) });
    }
    return route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ ...sentRequest, status: 'Reviewed', signitEnvelopeId: null }),
    });
  });

  await page.goto('/app/product/CreditGuard/requests/request-1/approval');
  await expect(page.getByText('envelope-abc123')).toBeVisible();
  await page.getByRole('button', { name: 'Recall from Signit' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Recall approval?' })).toBeVisible();
  await page.getByRole('button', { name: 'Recall approval' }).click();

  await expect(page.getByRole('alert')).toContainText('Signit did not confirm the envelope recall');
  await expect(page.getByText('envelope-abc123')).toBeVisible();
  await expect(page.getByText('Sent to Signit', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Recall from Signit' }).click();
  await page.getByRole('button', { name: 'Recall approval' }).click();

  await expect.poll(() => recallBody).toEqual({ orgId: 'org-1', productId: 'product-cg' });
  await expect(page.getByText('envelope-abc123')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Initiate Approval' })).toBeVisible();
  await expect(page.getByText(`${sentRequest.requestNumber} · Reviewed`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Recall from Signit' })).toHaveCount(0);
});
