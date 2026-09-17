import type { Page, Route } from '@playwright/test';
import type { MenuNode } from '@platform/shared';

export const user = {
  id: 'user-1',
  b2cOid: '',
  email: 'admin@example.test',
  displayName: 'Ada Admin',
  globalRoles: ['Global Administrator'],
};

export const organisation = {
  id: 'org-1',
  name: 'Global Organisation',
  slug: 'global',
  status: 'active',
  membership: 'Owner',
};

export const products = [
  { id: 'product-cg', code: 'CreditGuard', name: 'CreditGuard', description: 'Financial security workflow', isActive: true },
  { id: 'product-prime', code: 'PRIME', name: 'PRIME', description: 'Project controls', isActive: true },
];

export const creditGuardRequest = {
  id: 'request-1',
  orgId: organisation.id,
  projectId: null,
  requestNumber: 'CG-1001',
  instrumentType: 'Parent Company Guarantee',
  applicant: 'Designer Energy',
  beneficiary: 'Example Client',
  amount: 250000,
  currency: 'USD',
  status: 'Under Review',
  assignedReviewerUserId: 'user-2',
  assignedReviewerName: 'Riley Reviewer',
  assignedReviewerEmail: 'riley@example.test',
  submittedForReviewAt: '2026-09-02T00:00:00.000Z',
  requestedBy: 'Ada Admin',
  requestedByUserId: user.id,
  reviewedByUserId: null,
  reviewedAt: null,
  dueDate: '2026-10-01',
  nextReviewDate: '2026-09-20',
  notes: 'Priority request',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

export const creditGuardDetails = {
  emailRequestToCorporateTreasury: false,
  enableMultiEntity: false,
  parentCompanyOfferingGuarantee: ['entity-1'],
  dateSubmitted: '2026-09-01',
  requestingEntity: ['entity-1'],
  contractingEntity: ['entity-1'],
  proposalContractReference: 'PCG-1001',
  currentContractStatus: 'Award',
  beneficiaryAddress: '100 Example Street, Houston, TX 77002',
  pcgLanguage: 'Standard Description',
  maximumLiabilityPercent: '100',
  obligationsExtinguishedMode: 'date',
  obligationsExtinguishedDate: '2027-09-01',
  backgroundRequirement: 'Contract requirement',
  projectDescription: 'Example project',
  optionalComments: '',
  deliveryInstructions: '',
  attachments: '',
  requesterName: user.displayName,
  requesterApprovalDate: '2026-09-01',
  blFinanceVpNameTitle: 'Finance VP',
  blFinanceVpApprovalDate: '',
  blLegalDepartment: 'Legal',
  blLegalApprovalDate: '',
  sustainabilityGovernanceApproval: '',
  sustainabilityGovernanceApprovalDate: '',
  cfoApproval: '',
  cfoApprovalDate: '',
  corporateTreasuryApproval: '',
  corporateTreasuryApprovalDate: '',
  legalLanguageConfirmed: true,
};

export const creditGuardAttachment = {
  id: 'attachment-1',
  originalFileName: 'guarantee.pdf',
  mimeType: 'application/pdf',
  fileSizeBytes: 1280,
  sha256: 'a'.repeat(64),
  uploadedBy: user.displayName,
  createdAt: '2026-09-01T00:00:00.000Z',
};

const businessEntity = {
  id: 'entity-1',
  jobCodeEntity: '100',
  segment1: 'US',
  legalEntityName: 'Designer Energy LLC',
  ledgerName: 'US Ledger',
  inventoryOrgName: 'Houston',
  inventoryOrgCode: 'HOU',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

export const moduleUsers = [
  { id: user.id, displayName: user.displayName, email: user.email, roles: ['CreditGuard Requestor'] },
  { id: 'user-2', displayName: 'Riley Reviewer', email: 'riley@example.test', roles: ['CreditGuard Reviewer'] },
];

export const emailDeliveryLog = {
  id: 'email-log-1',
  orgId: organisation.id,
  module: 'CreditGuard',
  eventType: 'Request Review',
  referenceId: creditGuardRequest.id,
  recipientName: 'Riley Reviewer',
  recipientEmail: 'riley@example.test',
  subject: 'CreditGuard request CG-1001 requires review',
  status: 'Sent',
  smtpConfigurationId: 'smtp-1',
  smtpConfigurationName: 'Global SMTP',
  providerMessageId: 'message-1',
  errorMessage: null,
  initiatedBy: user.id,
  sentAt: '2026-09-02T00:00:01.000Z',
  createdAt: '2026-09-02T00:00:00.000Z',
};

export const approver = {
  id: 'approver-1',
  orgId: organisation.id,
  name: 'Taylor Approver',
  email: 'taylor@example.test',
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

const menu = {
  id: 'menu-business-entities',
  parentId: null,
  name: 'Business Entities',
  route: '/app/product/CreditGuard/application-setup/business-entities',
  icon: 'building',
  type: 'Secured',
  productId: 'product-cg',
  displayOrder: 1,
  isActive: true,
  accessMode: 'editable',
  children: [],
};

export const moduleUsersMenu = {
  ...menu,
  id: 'menu-module-users',
  name: 'Module Users',
  route: '/app/product/CreditGuard/application-setup/module-users',
  icon: 'users-round',
  displayOrder: 2,
};

export const integrationMenu = {
  ...menu,
  id: 'menu-integration',
  name: 'Integration',
  route: '/app/product/CreditGuard/application-setup/integration',
  icon: 'key-round',
  displayOrder: 3,
};

const profile = {
  id: user.id,
  firstName: 'Ada',
  lastName: 'Admin',
  displayName: user.displayName,
  email: user.email,
  username: 'ada.admin',
  hasPassword: true,
};

const settings = {
  id: 'settings-1',
  defaultOrgId: organisation.id,
  sessionTimeoutMinutes: 30,
  headerColor: '#ffffff',
  headerTextColor: '#0f172a',
  bannerEnabled: false,
  bannerBgColor: '#1e3a8a',
  bannerTextColor: '#ffffff',
  bannerContent: '',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function bodyFor(url: URL, method: string): unknown {
  const path = url.pathname.replace(/^\/api/, '');

  if (path === '/settings/banner') return { enabled: false, bgColor: '#1e3a8a', textColor: '#ffffff', content: null };
  if (path === '/account/theme') return { mode: 'light', preset: 'slate', radius: 6, brandColor: '#2563eb' };
  if (path === '/account') return profile;
  if (path === '/organisations/mine') return [organisation];
  if (path === '/organisations') return [];
  if (path === '/products' || (path === '/products' && url.search)) return products;
  if (path.startsWith('/products?')) return products;
  if (path === '/menus/mine') return [menu, moduleUsersMenu, integrationMenu];
  if (path === '/menus') return [menu, moduleUsersMenu, integrationMenu];
  if (/\/modules\/[^/]+\/integrations\/signit$/.test(path)) {
    return { provider: 'signit', baseUrl: '', authorizationKeyConfigured: false, updatedAt: null };
  }
  if (/\/modules\/[^/]+\/users$/.test(path)) return moduleUsers;
  if (path === '/notifications/reviewers') return moduleUsers.filter((moduleUser) => moduleUser.roles.includes('CreditGuard Reviewer'));
  if (path === '/notifications/request-review') return { status: 'sent', logId: emailDeliveryLog.id };
  if (path === '/notifications/reviewer-reassignment') return { status: 'sent', logId: emailDeliveryLog.id };
  if (path === '/notifications/email-logs') return [emailDeliveryLog];
  if (/\/modules\/[^/]+\/projects$/.test(path)) {
    return { projectRequired: false, lastProjectId: null, projects: [{ id: 'project-1', code: 'P-100', name: 'Demo Project' }] };
  }
  if (/\/project-modules$/.test(path)) return { modules: [], projects: [], allocations: [] };
  if (/\/team-projects$/.test(path)) return { projects: [], assignments: [] };
  if (/\/available-users$/.test(path) || /\/team$/.test(path)) return [];
  if (/\/teams$/.test(path)) return { teams: [], members: [], modules: [] };
  if (path === '/settings') return settings;
  if (path === '/roles' || path.endsWith('/menus') || path === '/users/roles') return [];
  if (path === '/projects' || path === '/projects/managers') return [];
  if (path === '/users') return [];
  if (/\/users\/[^/]+\/settings$/.test(path)) return null;
  if (path === '/sessions' && method === 'GET') return [];
  if (path === '/sessions' || path === '/sessions/administration') return { id: 'session-1' };
  if (path.includes('/heartbeat')) return {};
  return {};
}

export async function mockApp(page: Page, options: { requests?: typeof creditGuardRequest[]; menus?: MenuNode[] } = {}) {
  const requestRows = options.requests ?? [creditGuardRequest];

  await page.route('**/creditguard-api/**', async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname.endsWith('/business-entities')) {
      if (method === 'POST') {
        return json(route, { ...businessEntity, ...route.request().postDataJSON(), id: 'entity-new' });
      }
      return json(route, [businessEntity]);
    }
    if (url.pathname.includes('/business-entities/')) {
      if (method === 'DELETE') return json(route, {});
      return json(route, { ...businessEntity, ...route.request().postDataJSON() });
    }
    if (url.pathname.endsWith('/approvers')) {
      if (method === 'POST') {
        return json(route, { ...approver, ...route.request().postDataJSON(), id: 'approver-new' });
      }
      return json(route, [approver]);
    }
    if (url.pathname.includes('/approvers/')) {
      if (method === 'DELETE') return json(route, { ok: true });
      return json(route, { ...approver, ...route.request().postDataJSON() });
    }
    if (url.pathname.endsWith('/requests')) {
      if (method === 'POST') {
        return json(route, { ...creditGuardRequest, ...route.request().postDataJSON(), id: 'request-new' });
      }
      return json(route, requestRows);
    }
    if (/\/requests\/[^/]+\/attachments$/.test(url.pathname)) {
      if (method === 'POST') return json(route, { ...creditGuardAttachment, id: 'attachment-new' });
      return json(route, [creditGuardAttachment]);
    }
    if (/\/requests\/[^/]+\/attachments\/[^/]+\/content$/.test(url.pathname)) {
      return route.fulfill({ status: 200, contentType: 'application/pdf', body: '%PDF-1.7 test' });
    }
    if (/\/requests\/[^/]+\/attachments\/[^/]+$/.test(url.pathname) && method === 'DELETE') {
      return json(route, { ok: true });
    }
    if (/\/requests\/[^/]+\/submit-for-review$/.test(url.pathname) && method === 'POST') {
      const body = route.request().postDataJSON();
      return json(route, {
        ...creditGuardRequest,
        status: 'Under Review',
        assignedReviewerUserId: body.reviewerUserId,
        assignedReviewerName: body.reviewerName,
        assignedReviewerEmail: body.reviewerEmail,
        submittedForReviewAt: '2026-09-02T00:00:00.000Z',
        previousReviewerUserId: creditGuardRequest.assignedReviewerUserId,
      });
    }
    if (/\/requests\/[^/]+\/review-done$/.test(url.pathname) && method === 'POST') {
      return json(route, { ...creditGuardRequest, status: 'Reviewed', reviewedByUserId: 'user-2', reviewedAt: '2026-09-03T00:00:00.000Z' });
    }
    if (/\/requests\/[^/]+\/attach-request$/.test(url.pathname) && method === 'POST') {
      return json(route, {
        ...creditGuardAttachment,
        id: 'attachment-request-pdf',
        originalFileName: `${creditGuardRequest.requestNumber} latest.pdf`,
        uploadedBy: 'Generated by Riley Reviewer',
      });
    }
    if (/\/requests\/[^/]+\/approver-assignments$/.test(url.pathname)) {
      if (method === 'PUT') {
        const body = route.request().postDataJSON() as { approvers: Array<{ sequenceOrder: number; title: string; approverId: string | null }> };
        return json(route, body.approvers.map((assignment) => ({
          ...assignment,
          id: `assignment-${assignment.sequenceOrder}`,
          approverName: assignment.approverId ? approver.name : null,
          approverEmail: assignment.approverId ? approver.email : null,
          approvalStatus: 'pending',
        })));
      }
      return json(route, []);
    }
    if (url.pathname.includes('/requests/')) {
      if (method === 'DELETE') return json(route, {});
      if (method === 'GET') return json(route, { ...creditGuardRequest, details: creditGuardDetails });
      return json(route, { ...creditGuardRequest, ...route.request().postDataJSON() });
    }
    return json(route, {});
  });

  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.replace(/^\/api/, '') === '/menus/mine' && options.menus) {
      return json(route, options.menus);
    }
    if (/\/modules\/[^/]+\/users\/[^/]+\/designation$/.test(url.pathname)) {
      return json(route, { userId: url.pathname.split('/').at(-2), ...route.request().postDataJSON() });
    }
    return json(route, bodyFor(url, route.request().method()));
  });
}

export async function authenticate(page: Page, currentUser = user) {
  await page.addInitScript(({ currentUser, currentOrg }) => {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem('platformAuthToken', `header.${payload}.signature`);
    localStorage.setItem('platformAuthUser', JSON.stringify(currentUser));
    localStorage.setItem('selectedOrgId', JSON.stringify(currentOrg));
  }, { currentUser, currentOrg: organisation });
}

export async function setupAuthenticatedApp(page: Page, options: { requests?: typeof creditGuardRequest[]; menus?: MenuNode[]; currentUser?: typeof user } = {}) {
  await authenticate(page, options.currentUser);
  await mockApp(page, options);
}
