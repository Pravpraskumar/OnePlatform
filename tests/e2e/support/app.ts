import type { Page, Route } from '@playwright/test';

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
  requestedBy: 'Ada Admin',
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
  if (path === '/menus/mine') return [menu];
  if (path === '/menus') return [menu];
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

export async function mockApp(page: Page, options: { requests?: typeof creditGuardRequest[] } = {}) {
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
    if (url.pathname.endsWith('/requests')) {
      if (method === 'POST') {
        return json(route, { ...creditGuardRequest, ...route.request().postDataJSON(), id: 'request-new' });
      }
      return json(route, requestRows);
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
    return json(route, bodyFor(url, route.request().method()));
  });
}

export async function authenticate(page: Page) {
  await page.addInitScript(({ currentUser, currentOrg }) => {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    localStorage.setItem('platformAuthToken', `header.${payload}.signature`);
    localStorage.setItem('platformAuthUser', JSON.stringify(currentUser));
    localStorage.setItem('selectedOrgId', JSON.stringify(currentOrg));
  }, { currentUser: user, currentOrg: organisation });
}

export async function setupAuthenticatedApp(page: Page) {
  await authenticate(page);
  await mockApp(page);
}
