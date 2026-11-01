import { expect, test, type Page, type Route } from '@playwright/test';
import { organisation, setupAuthenticatedApp } from './support/app';

const opportunity = {
  id: 'opportunity-1',
  opportunityNumber: 'R4012',
  name: 'PTTEP Lang Lebah T&I',
  client: 'PTTEP',
  region: 'Malaysia - offshore Sarawak',
  scopeType: 'T&I',
  status: 'Pre-ITT',
  campaignWindow: 'Q2 2027',
  estimatedValueUsdMillions: 180,
  waterDepthMetres: 85,
  updatedAt: '2026-09-29T00:00:00.000Z',
};

const plan = {
  id: 'plan-1',
  title: 'R4012 - PTTEP Lang Lebah T&I',
  status: 'Draft',
  currentVersion: 1,
  updatedAt: '2026-09-29T00:00:00.000Z',
};

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockCapturePro(page: Page, options: { failOverview?: boolean } = {}) {
  await page.route(/\/(?:capturepro-api|api)\/(?:overview|opportunities|data-sets(?:\/[^/?]+\/documents)?|plans(?:\/[^/?]+(?:\/(?:sections\/[^/?]+|versions))?)?|audit)(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname.endsWith('/overview')) {
      return options.failOverview
        ? json(route, { message: 'Capture-Pro unavailable' }, 503)
        : json(route, { opportunityCount: 1, planCount: 1, dataSetCount: 8, sourceItemCount: 628, recentOpportunities: [opportunity] });
    }
    if (url.pathname.endsWith('/opportunities')) {
      if (method === 'POST') return json(route, { ...opportunity, ...route.request().postDataJSON(), id: 'opportunity-new' });
      return json(route, [opportunity]);
    }
    if (url.pathname.endsWith('/data-sets/dataset-1/documents')) {
      if (method === 'POST') return json(route, { id: 'document-new', ...route.request().postDataJSON() });
      return json(route, []);
    }
    if (url.pathname.endsWith('/data-sets')) return json(route, [{
      id: 'dataset-1', key: 'structured-data', name: '1.0 Data', category: 'TG3',
      description: 'Structured extracts and reference', sourceLocation: 'TG3 - Build and Test Plan', itemCount: 15,
      freshnessPolicy: 'On controlled file change',
    }]);
    if (url.pathname.endsWith('/plans/plan-1/sections/CP-14') && method === 'PATCH') return json(route, {
      id: 'section-14', code: 'CP-14', title: 'Section 14', owningAgent: 'Capture Strategy', ...route.request().postDataJSON(),
    });
    if (url.pathname.endsWith('/plans/plan-1/versions') && method === 'POST') return json(route, {
      id: 'version-2', planId: 'plan-1', version: 2, changeSummary: route.request().postDataJSON().changeSummary,
    });
    if (url.pathname.endsWith('/plans/plan-1')) return json(route, {
      plan,
      opportunity,
      version: { version: 1, changeSummary: 'Initial capture plan commissioned', createdAt: '2026-09-29T00:00:00.000Z' },
      sections: Array.from({ length: 14 }, (_, index) => ({
        id: `section-${index + 1}`, code: `CP-${String(index + 1).padStart(2, '0')}`, title: `Section ${index + 1}`,
        owningAgent: index === 4 ? 'Vessel Matching' : 'Capture Strategy', status: 'Waiting', content: {}, citations: [],
      })),
      runs: [],
      auditEvents: [{ id: 'event-1', actorType: 'Human', actorId: 'user-1', action: 'Capture plan commissioned', createdAt: '2026-09-29T00:00:00.000Z' }],
    });
    if (url.pathname.endsWith('/plans')) {
      if (method === 'POST') return json(route, plan);
      return json(route, []);
    }
    if (url.pathname.endsWith('/audit')) return json(route, []);
    return json(route, {});
  });
}

test.beforeEach(async ({ page }) => {
  await setupAuthenticatedApp(page);
});

test('renders the Capture-Pro command center and TG3 data library', async ({ page }) => {
  await mockCapturePro(page);
  await page.goto('/app/product/Capture-Pro');
  await expect(page.getByRole('heading', { name: 'Capture-Pro command center' })).toBeVisible();
  await expect(page.getByText('628')).toBeVisible();

  await page.goto('/app/product/Capture-Pro/data-library');
  await expect(page.getByRole('heading', { name: 'TG3 governed data library' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '1.0 Data' })).toBeVisible();
  await expect(page.getByText('SharePoint content ingestion requires')).toBeVisible();
});

test('registers governed source metadata without uploading content', async ({ page }) => {
  await mockCapturePro(page);
  const requestPromise = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/data-sets/dataset-1/documents') && request.method() === 'POST');
  await page.goto('/app/product/Capture-Pro/data-library');
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByLabel('1.0 Data file name').fill('ITT Addendum 03.pdf');
  await page.getByLabel('1.0 Data document type').fill('ITT Addendum');
  await page.getByLabel('1.0 Data source URL').fill('https://example.sharepoint.com/sites/tg3/ITT%20Addendum%2003.pdf');
  await page.getByRole('button', { name: 'Register source' }).click();
  const request = await requestPromise;
  expect(request.postDataJSON()).toMatchObject({ orgId: organisation.id, fileName: 'ITT Addendum 03.pdf', documentType: 'ITT Addendum' });
  await expect(page.getByText('ITT Addendum 03.pdf')).toBeVisible();
});

test('the Opportunities route shows Salesforce Opportunities without manual creation', async ({ page }) => {
  await mockCapturePro(page);
  let createRequested = false;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/opportunities') && request.method() === 'POST') createRequested = true;
  });
  await page.route(/\/salesforce-opportunities\?/, (route) => json(route, { lastSync: null, opportunities: [] }));
  await page.goto('/app/product/Capture-Pro');
  await page.getByRole('link', { name: 'Salesforce opportunities' }).click();
  await expect(page).toHaveURL(/\/app\/product\/Capture-Pro\/opportunities$/);
  await expect(page.getByRole('heading', { name: 'Salesforce Opportunities', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add opportunity' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Create opportunity' })).toHaveCount(0);
  expect(createRequested).toBe(false);
});

test('commissions and opens a fourteen-section capture plan', async ({ page }) => {
  await mockCapturePro(page);
  await page.goto('/app/product/Capture-Pro/plans');
  await page.getByLabel('Opportunity').selectOption(opportunity.id);
  await page.getByRole('button', { name: 'Commission' }).click();
  await page.getByRole('heading', { name: plan.title }).click();
  await expect(page).toHaveURL(/\/plans\/plan-1$/);
  await expect(page.getByText('CP-14')).toBeVisible();
  await expect(page.getByText('0/14')).toBeVisible();
});

test('updates a plan section and creates a successor version', async ({ page }) => {
  await mockCapturePro(page);
  const sectionRequestPromise = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/plans/plan-1/sections/CP-14') && request.method() === 'PATCH');
  await page.goto('/app/product/Capture-Pro/plans/plan-1');
  await page.getByRole('button', { name: /CP-14 Section 14/ }).click();
  await page.getByLabel('Section narrative').fill('Local content obligations validated against the current client schedule.');
  await page.getByLabel('Citation labels').fill('ITT Addendum 03.pdf');
  await page.getByLabel('Status').selectOption('Needs Input');
  await page.getByRole('button', { name: 'Save section' }).click();
  const sectionRequest = await sectionRequestPromise;
  expect(sectionRequest.postDataJSON()).toMatchObject({ orgId: organisation.id, status: 'Needs Input', content: { narrative: 'Local content obligations validated against the current client schedule.' }, citations: [{ label: 'ITT Addendum 03.pdf' }] });

  const versionRequestPromise = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith('/plans/plan-1/versions') && request.method() === 'POST');
  await page.getByRole('button', { name: 'New version' }).click();
  await page.getByLabel('Change summary').fill('Incorporate verified tender addendum');
  await page.getByRole('button', { name: 'Create version' }).click();
  const versionRequest = await versionRequestPromise;
  expect(versionRequest.postDataJSON()).toEqual({ orgId: organisation.id, changeSummary: 'Incorporate verified tender addendum' });
});

test('shows an actionable overview failure', async ({ page }) => {
  await mockCapturePro(page, { failOverview: true });
  await page.goto('/app/product/Capture-Pro');
  await expect(page.getByRole('alert')).toContainText('Capture-Pro API 503');
});