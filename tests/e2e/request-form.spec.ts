import { expect, test } from '@playwright/test';
import { creditGuardAttachment, creditGuardDetails, creditGuardRequest, moduleUsers, setupAuthenticatedApp } from './support/app';

test.beforeEach(async ({ page }, testInfo) => {
  const currentUser = testInfo.title.includes('assigned reviewer')
    ? { id: 'user-2', b2cOid: '', email: 'riley@example.test', displayName: 'Riley Reviewer', globalRoles: ['CreditGuard Reviewer'] }
    : undefined;
  await setupAuthenticatedApp(page, { currentUser });
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
  await expect(page.getByLabel('Attach documents')).toHaveCount(0);
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
  await expect(page.getByRole('status').filter({ hasText: 'Draft request saved successfully.' })).toBeVisible();
});

test('Under Review request is read-only except for attachments', async ({ page }) => {
  await page.goto('/app/product/CreditGuard/requests/request-1/edit');

  const editRequestHeading = page.getByRole('heading', { name: 'Edit Company Guarantee Request' });
  await expect(editRequestHeading).toBeVisible();
  await expect(editRequestHeading.locator('xpath=ancestor::header')).toHaveClass(/bg-gradient-to-r/);
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveClass(/bg-white/);
  await expect(page.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Review done' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Requesting division and approvals' })).toHaveCount(0);
  await expect(page.getByText('Request details are read-only while review and approvals are in progress.')).toBeVisible();
  await expect(page.getByLabel('Proposal/contract reference number and name')).toHaveValue('PCG-1001');
  await expect(page.getByLabel('Proposal/contract reference number and name')).toBeDisabled();
  await expect(page.getByLabel('Beneficiary name')).toHaveValue('Example Client');
  await expect(page.getByLabel('Beneficiary address')).toHaveValue('100 Example Street, Houston, TX 77002');
  await expect(page.getByText('guarantee.pdf')).toBeVisible();
  await expect(page.getByTitle('Open guarantee.pdf')).toBeVisible();
  await expect(page.getByTitle('Delete guarantee.pdf')).toBeVisible();
});

test('requestor reassigns an Under Review request and notifies both reviewers', async ({ page }) => {
  const replacementReviewer = { id: 'user-3', displayName: 'Casey Reviewer', email: 'casey@example.test', roles: ['CreditGuard Reviewer'] };
  await page.route('**/api/notifications/reviewers?*', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify([...moduleUsers.filter((moduleUser) => moduleUser.roles.includes('CreditGuard Reviewer')), replacementReviewer]),
  }));
  let requestDetailsPatched = false;
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && request.url().endsWith('/creditguard-api/requests/request-1')) requestDetailsPatched = true;
  });
  await page.goto('/app/product/CreditGuard/requests/request-1/edit');

  await expect(page.getByText(/Current reviewer:.*Riley Reviewer/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reassign reviewer' })).toBeDisabled();
  await page.getByLabel('Reviewer').selectOption(replacementReviewer.id);

  const transitionRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/creditguard-api/requests/request-1/submit-for-review'));
  const pullbackRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/notifications/reviewer-reassignment'));
  const assignmentRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/notifications/request-review'));
  await page.getByRole('button', { name: 'Reassign reviewer' }).click();

  expect((await transitionRequest).postDataJSON()).toMatchObject({ reviewerUserId: replacementReviewer.id });
  expect((await pullbackRequest).postDataJSON()).toMatchObject({
    previousReviewerUserId: 'user-2',
    newReviewerUserId: replacementReviewer.id,
    requestId: 'request-1',
  });
  expect((await assignmentRequest).postDataJSON()).toMatchObject({ reviewerUserId: replacementReviewer.id });
  expect(requestDetailsPatched).toBe(false);
  await expect(page.getByText(/Current reviewer:.*Casey Reviewer/)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'both reviewers notified' })).toBeVisible();
});

test('edit request does not render trailing empty scroll space', async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/app/product/CreditGuard/requests/request-1/edit');

    const geometry = await page.locator('form').evaluate((form) => {
      const fieldset = form.querySelector('fieldset');
      const cards = form.querySelectorAll(':scope > div');
      const finalCard = cards.item(cards.length - 1);
      if (!fieldset || !finalCard) return null;
      const formRect = form.getBoundingClientRect();
      const fieldsetRect = fieldset.getBoundingClientRect();
      const finalCardRect = finalCard.getBoundingClientRect();
      return {
        fieldsetHeight: fieldsetRect.height,
        trailingSpace: Math.round(formRect.bottom - finalCardRect.bottom),
        rootOverflow: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry!.fieldsetHeight).toBeGreaterThan(0);
    expect(geometry!.trailingSpace).toBeLessThanOrEqual(1);
    expect(geometry!.rootOverflow).toBe(0);
  }
});

test('assigned reviewer can attach the request PDF and complete review separately', async ({ page }) => {
  await page.goto('/app/product/CreditGuard/requests/request-1/edit');

  const attachRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/creditguard-api/requests/request-1/attach-request'));
  await page.getByRole('button', { name: 'Attach Request' }).click();
  expect((await attachRequest).postDataJSON()).toEqual({ orgId: 'org-1' });
  await expect(page.getByText('CG-1001 latest.pdf')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Request PDF attached successfully.' })).toBeVisible();

  const reviewRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/creditguard-api/requests/request-1/review-done'));
  await page.getByRole('button', { name: 'Review done' }).click();
  expect((await reviewRequest).postDataJSON()).toEqual({ orgId: 'org-1' });
  await expect(page.getByText('Reviewed', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Attach documents')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Attach Request' })).toHaveCount(0);
  await expect(page.getByTitle('Delete guarantee.pdf')).toHaveCount(0);
  await expect(page.getByTitle('Open guarantee.pdf')).toBeVisible();
});

test('draft request assigns an eligible reviewer, submits for review, and requests email delivery', async ({ page }) => {
  await page.route('**/creditguard-api/requests/request-1?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...creditGuardRequest,
        status: 'Draft',
        assignedReviewerUserId: null,
        assignedReviewerName: null,
        assignedReviewerEmail: null,
        submittedForReviewAt: null,
        details: { ...creditGuardDetails, legalLanguageConfirmed: false },
      }),
    }),
  );
  await page.route('**/creditguard-api/requests/request-1/attachments?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ ...creditGuardAttachment, originalFileName: `${creditGuardRequest.requestNumber} latest.pdf` }]),
    }),
  );
  await page.goto('/app/product/CreditGuard/requests/request-1/edit');

  await expect(page.getByRole('heading', { name: 'Assign Reviewer and Submit' })).toBeVisible();
  await page.getByLabel('Reviewer').selectOption('user-2');
  const transitionRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/creditguard-api/requests/request-1/submit-for-review'));
  const emailRequest = page.waitForRequest((request) => request.method() === 'POST' && request.url().endsWith('/api/notifications/request-review'));
  await page.getByRole('button', { name: 'Submit for review' }).click();

  expect((await transitionRequest).postDataJSON()).toEqual({
    orgId: 'org-1',
    reviewerUserId: 'user-2',
    reviewerName: 'Riley Reviewer',
    reviewerEmail: 'riley@example.test',
  });
  expect((await emailRequest).postDataJSON()).toMatchObject({
    orgId: 'org-1',
    productId: 'product-cg',
    reviewerUserId: 'user-2',
    requestId: 'request-1',
    requestNumber: 'CG-1001',
    beneficiary: 'Example Client',
  });
  await expect(page.getByText('Under Review', { exact: true })).toBeVisible();
  await expect(page.getByText(/Assigned reviewer:.*Riley Reviewer/)).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'reviewer notified' })).toBeVisible();
});

test('draft edit saves a changed beneficiary address before legal review', async ({ page }) => {
  await page.route('**/creditguard-api/requests/request-1?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...creditGuardRequest,
        status: 'Draft',
        details: { ...creditGuardDetails, beneficiaryAddress: '', legalLanguageConfirmed: false },
      }),
    }),
  );
  await page.goto('/app/product/CreditGuard/requests/request-1/edit');

  await page.getByLabel('Beneficiary address').fill('200 Updated Street, Houston, TX 77002');
  const updateRequest = page.waitForRequest((request) =>
    request.method() === 'PATCH' && request.url().endsWith('/creditguard-api/requests/request-1'),
  );
  await page.getByRole('button', { name: 'Save changes' }).click();

  expect((await updateRequest).postDataJSON()).toMatchObject({
    status: 'Draft',
    details: {
      beneficiaryAddress: '200 Updated Street, Houston, TX 77002',
      legalLanguageConfirmed: false,
    },
  });
});

test('draft request cannot be submitted for review with only an ordinary attachment', async ({ page }) => {
  await page.route('**/creditguard-api/requests/request-1?*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...creditGuardRequest,
        status: 'Draft',
        assignedReviewerUserId: null,
        assignedReviewerName: null,
        assignedReviewerEmail: null,
        submittedForReviewAt: null,
        details: { ...creditGuardDetails, legalLanguageConfirmed: false },
      }),
    }),
  );
  await page.route('**/creditguard-api/requests/request-1/attachments?*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([creditGuardAttachment]) }),
  );
  await page.goto('/app/product/CreditGuard/requests/request-1/edit');

  await expect(page.getByText(creditGuardAttachment.originalFileName)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit for review' })).toBeDisabled();
  let submitAttempted = false;
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/creditguard-api/requests/request-1/submit-for-review')) {
      submitAttempted = true;
    }
  });
  expect(submitAttempted).toBe(false);
});
