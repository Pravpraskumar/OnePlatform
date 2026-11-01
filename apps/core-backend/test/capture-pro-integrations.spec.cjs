require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { after, before, beforeEach, test, mock } = require('node:test');
const { Module, ValidationPipe } = require('@nestjs/common');
const { APP_GUARD, NestFactory, Reflector } = require('@nestjs/core');
const { ConfigService } = require('@nestjs/config');
const { getTableColumns } = require('drizzle-orm');
const { Pool } = require('pg');
const { B2cAuthGuard } = require('../dist/auth/b2c-auth.guard');
const { B2cTokenService } = require('../dist/auth/b2c-token.service');
const { LocalTokenService } = require('../dist/auth/local-token.service');
const { CaptureProIntegrationsController } = require('../dist/organisations/capture-pro-integrations.controller');
const { CaptureProIntegrationsService } = require('../dist/organisations/capture-pro-integrations.service');
const { createDb } = require('../dist/db');
const { CORE_DB } = require('../dist/db/database.module');
const { organisationProductIntegrations } = require('../dist/db/schema');
const { decryptSecret } = require('../dist/common/crypto');

const orgId = randomUUID();
const otherOrgId = randomUUID();
const productId = randomUUID();
const userId = randomUUID();
const secret = () => randomBytes(24).toString('hex');
const serviceKey = secret();
const input = () => ({
  authType: 'OAuth2.0',
  grantType: 'client_credentials',
  accessTokenUrl: 'https://example.my.salesforce.com/services/oauth2/token',
  clientId: 'example-client',
  clientSecret: secret(),
});
const actor = { id: userId, b2cOid: '', email: 'admin@example.test', displayName: 'Integration Admin', globalRoles: [] };
const pool = new Pool();
const database = createDb(pool);
let state;
let app;
let baseUrl;
let token;
let tokens;
let previousKey;

mock.method(pool, 'query', async (query, values) => {
  const text = query.text;
  if (text.includes('from "organisation_users"')) {
    assert.deepEqual(values, [state.requestedOrg ?? orgId, userId, 'active']);
    assert.match(text, /"organisation_users"\."org_id" = \$1/);
    assert.match(text, /"organisation_users"\."user_id" = \$2/);
    assert.match(text, /"organisation_users"\."status" = \$3/);
    return { rows: state.member && values[0] === orgId ? [[state.member]] : [] };
  }
  if (text.includes('from "user_roles"')) {
    assert.deepEqual(values, [userId, orgId, productId, 'Capture-Pro Module Administrator']);
    assert.match(text, /"roles"\."product_id" = \$3/);
    assert.match(text, /"user_roles"\."org_id" is null or "user_roles"\."org_id" = \$2/);
    return { rows: state.moduleAdmin ? [[randomUUID()]] : [] };
  }
  if (text.includes('from "organisation_modules"')) {
    assert.deepEqual(values.slice(0, 3), [orgId, productId, 'active']);
    assert.deepEqual(values.slice(5), ['Capture-Pro', true, 'active']);
    assert.match(text, /"organisation_modules"\."valid_from" <= \$4/);
    assert.match(text, /"organisation_modules"\."valid_to" > \$5/);
    assert.match(text, /"products"\."code" = \$6/);
    assert.match(text, /"products"\."is_active" = \$7/);
    assert.match(text, /"organisations"\."status" = \$8/);
    return { rows: state.activeModule ? [[randomUUID()]] : [] };
  }
  if (text.startsWith('select') && text.includes('from "organisation_product_integrations"')) {
    assert.deepEqual(values, [orgId, productId, 'salesforce', 'spinergie']);
    assert.match(text, /"organisation_product_integrations"\."org_id" = \$1/);
    assert.match(text, /"organisation_product_integrations"\."product_id" = \$2/);
    const columns = Object.keys(getTableColumns(organisationProductIntegrations));
    return { rows: state.rows.map((row) => columns.map((column) => row[column] ?? null)) };
  }
  if (text.startsWith('insert into "organisation_product_integrations"')) {
    assert.match(text, /on conflict \("org_id","product_id","provider"\) do update/);
    assert.deepEqual(values.slice(0, 2), [orgId, productId]);
    const [savedOrg, savedProduct, provider, base, encrypted, updatedBy, updatedAt] = values;
    state.rows = state.rows.filter((row) => row.provider !== provider);
    state.rows.push({
      id: randomUUID(), orgId: savedOrg, productId: savedProduct, provider,
      baseUrl: base, authorizationSecret: encrypted, updatedBy, updatedAt: new Date(updatedAt),
    });
    state.writes++;
    return { rows: [] };
  }
  if (text.startsWith('delete from "organisation_product_integrations"')) {
    assert.deepEqual(values.slice(0, 2), [orgId, productId]);
    assert.match(text, /"organisation_product_integrations"\."org_id" = \$1/);
    assert.match(text, /"organisation_product_integrations"\."product_id" = \$2/);
    assert.match(text, /"organisation_product_integrations"\."provider" = \$3/);
    state.rows = state.rows.filter((row) => row.provider !== values[2]);
    state.writes++;
    return { rows: [] };
  }
  throw new Error('Unexpected database operation in integration test');
});

before(async () => {
  previousKey = process.env.CONNECTION_SECRET_KEY;
  process.env.CONNECTION_SECRET_KEY = randomBytes(32).toString('base64');
  const config = new ConfigService({
    LOCAL_JWT_SECRET: secret(), B2C_TENANT_NAME: 'example', B2C_POLICY_NAME: 'example', B2C_CLIENT_ID: 'example',
    CAPTUREPRO_INTERNAL_API_KEY: serviceKey,
  });
  tokens = new LocalTokenService(config);
  token = tokens.sign({ sub: userId, email: actor.email });
  class IntegrationTestModule {}
  Module({
    controllers: [CaptureProIntegrationsController],
    providers: [
      CaptureProIntegrationsService,
      { provide: ConfigService, useValue: config },
      { provide: CORE_DB, useValue: database },
      {
        provide: APP_GUARD,
        useFactory: () => new B2cAuthGuard(new Reflector(), new B2cTokenService(config), tokens, {
          resolveById: async () => ({ ...actor, globalRoles: state.globalRoles }),
        }),
      },
    ],
  })(IntegrationTestModule);
  app = await NestFactory.create(IntegrationTestModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  baseUrl = `${await app.getUrl()}/organisations/${orgId}/modules/${productId}/integrations/capture-pro`;
});

after(async () => {
  await app?.close();
  await pool.end();
  if (previousKey === undefined) delete process.env.CONNECTION_SECRET_KEY;
  else process.env.CONNECTION_SECRET_KEY = previousKey;
  mock.restoreAll();
});

beforeEach(() => {
  state = { member: 'Member', moduleAdmin: true, activeModule: true, globalRoles: [], rows: [], writes: 0 };
});

function request(path = '', method = 'GET', body, bearer = token) {
  return fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test('requires a valid bearer token and rejects tampered local tokens', async () => {
  assert.equal((await request('', 'GET', undefined, '')).status, 401);
  const invalid = new LocalTokenService(new ConfigService({ LOCAL_JWT_SECRET: secret() })).sign({ sub: userId, email: actor.email });
  assert.equal((await request('', 'GET', undefined, invalid)).status, 401);
  const expired = require('jsonwebtoken').sign({ sub: userId, typ: 'local', exp: 1 }, secret());
  assert.equal((await request('', 'GET', undefined, expired)).status, 401);
});

test('module administrators can read configuration status without receiving credentials', async () => {
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    salesforce: { authType: 'OAuth2.0', grantType: 'client_credentials', accessTokenUrl: '', clientId: '', clientSecretConfigured: false, updatedAt: null },
    spinergie: { apiKeyConfigured: false, updatedAt: null },
  });
});

test('Spinergie extraction requires the service key, active membership and integration administrator role', async () => {
  const service = app.get(CaptureProIntegrationsService);
  await assert.rejects(service.extractSpinergieVessels(orgId, productId, undefined, actor), /service authentication required/);
  await assert.rejects(service.extractSpinergieCharters(orgId, productId, undefined, actor), /service authentication required/);
  state.moduleAdmin = false;
  await assert.rejects(service.extractSpinergieVessels(orgId, productId, serviceKey, actor), /administrator access required/);
  await assert.rejects(service.extractSpinergieCharters(orgId, productId, serviceKey, actor), /administrator access required/);
  state.moduleAdmin = true;
  state.member = null;
  await assert.rejects(service.extractSpinergieVessels(orgId, productId, serviceKey, actor), /administrator access required/);
  await assert.rejects(service.extractSpinergieCharters(orgId, productId, serviceKey, actor), /administrator access required/);
  assert.equal(state.writes, 0);
});

test('Spinergie extraction rejects inactive product assignments and missing saved credentials', async () => {
  const service = app.get(CaptureProIntegrationsService);
  state.activeModule = false;
  await assert.rejects(service.extractSpinergieVessels(orgId, productId, serviceKey, actor), /active Capture-Pro organisation assignment/);
  state.activeModule = true;
  await assert.rejects(service.extractSpinergieVessels(orgId, productId, serviceKey, actor), /Spinergie integration is not configured/);
  assert.equal(state.writes, 0);
});

for (const membership of ['Owner', 'Admin']) {
  test(`organisation ${membership} can configure integrations without a module role`, async () => {
    state.member = membership;
    state.moduleAdmin = false;
    assert.equal((await request('/spinergie', 'PUT', { apiKey: secret() })).status, 200);
  });
}

test('global administrators can manage an active organisation assignment', async () => {
  state.member = null;
  state.moduleAdmin = false;
  state.globalRoles = ['Global Administrator'];
  assert.equal((await request()).status, 200);
});

test('managers, analysts, and ordinary members cannot read, save, or remove credentials', async () => {
  state.moduleAdmin = false;
  for (const roles of [[], ['Capture-Pro Manager'], ['Capture-Pro Analyst'], ['Organisation Administrator']]) {
    state.globalRoles = roles;
    for (const [path, method, body] of [
      ['', 'GET'], ['/salesforce', 'PUT', input()], ['/spinergie', 'PUT', { apiKey: secret() }],
      ['/salesforce', 'DELETE'], ['/spinergie', 'DELETE'],
    ]) {
      assert.equal((await request(path, method, body)).status, 403);
    }
  }
  assert.equal(state.writes, 0);
});

test('module administrators cannot cross into an organisation where they are not active members', async () => {
  state.member = null;
  assert.equal((await request()).status, 403);
  state.member = 'Member';
  state.requestedOrg = otherOrgId;
  const url = baseUrl.replace(orgId, otherOrgId);
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const response = await fetch(`${url}${method === 'GET' ? '' : '/spinergie'}`, {
      method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(method === 'PUT' ? { body: JSON.stringify({ apiKey: secret() }) } : {}),
    });
    assert.equal(response.status, 403);
  }
  assert.equal(state.writes, 0);
});

test('inactive, unassigned, expired, or non-Capture-Pro modules are denied', async () => {
  state.activeModule = false;
  for (const [path, method, body] of [['', 'GET'], ['/salesforce', 'PUT', input()], ['/spinergie', 'DELETE']]) {
    assert.equal((await request(path, method, body)).status, 403);
  }
  assert.equal(state.writes, 0);
});

test('Salesforce credentials are encrypted, omitted from responses, retained on blank replacement, and rotated', async () => {
  const initial = input();
  let response = await request('/salesforce', 'PUT', initial);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).salesforce.clientSecretConfigured, true);
  const encrypted = state.rows[0].authorizationSecret;
  assert.ok(encrypted.startsWith('enc:'));
  assert.ok(!encrypted.includes(initial.clientSecret));
  assert.deepEqual(JSON.parse(decryptSecret(encrypted)), { clientId: initial.clientId, clientSecret: initial.clientSecret });
  assert.equal(state.rows[0].updatedBy, userId);
  const { clientSecret, ...unchanged } = initial;
  response = await request('/salesforce', 'PUT', unchanged);
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(decryptSecret(state.rows[0].authorizationSecret)).clientSecret, clientSecret);
  const replacement = secret();
  response = await request('/salesforce', 'PUT', { ...initial, clientSecret: replacement });
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(decryptSecret(state.rows[0].authorizationSecret)).clientSecret, replacement);
  const output = await (await request()).text();
  assert.ok(!output.includes(clientSecret));
  assert.ok(!output.includes(replacement));
  assert.ok(!output.includes('authorizationSecret'));
  assert.ok(!output.includes('enc:'));
});

test('Spinergie accepts only an API key, encrypts and rotates it, and never returns it', async () => {
  const apiKey = secret();
  let response = await request('/spinergie', 'PUT', { apiKey });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    salesforce: { authType: 'OAuth2.0', grantType: 'client_credentials', accessTokenUrl: '', clientId: '', clientSecretConfigured: false, updatedAt: null },
    spinergie: { apiKeyConfigured: true, updatedAt: state.rows[0].updatedAt.toISOString() },
  });
  assert.equal(state.rows[0].baseUrl, null);
  assert.equal(decryptSecret(state.rows[0].authorizationSecret), apiKey);
  const replacement = secret();
  response = await request('/spinergie', 'PUT', { apiKey: replacement });
  assert.equal(response.status, 200);
  assert.equal(decryptSecret(state.rows[0].authorizationSecret), replacement);
  assert.ok(!(await response.text()).includes(replacement));
});

test('rejects missing, blank, null, oversized, unknown, or invalid fields without reflecting secrets', async () => {
  const salesforce = input();
  for (const body of [
    {}, { ...salesforce, authType: 'Basic' }, { ...salesforce, grantType: 'password' },
    { ...salesforce, clientId: '   ' }, { ...salesforce, clientSecret: '' },
    { ...salesforce, clientSecret: null }, { ...salesforce, clientSecret: ' '.repeat(5) },
    { ...salesforce, clientSecret: secret().repeat(300) }, { ...salesforce, orgId: otherOrgId },
  ]) {
    const response = await request('/salesforce', 'PUT', body);
    assert.equal(response.status, 400);
    assert.ok(!(await response.text()).includes(salesforce.clientSecret));
  }
  for (const body of [{}, { apiKey: null }, { apiKey: '' }, { apiKey: ' ' }, { apiKey: 1 }, { apiKey: secret().repeat(300) }, { apiKey: secret(), baseUrl: 'https://example.test' }]) {
    assert.equal((await request('/spinergie', 'PUT', body)).status, 400);
  }
  assert.equal(state.writes, 0);
});

test('requires a Salesforce secret initially and when changing the client or token endpoint', async () => {
  const salesforce = input();
  const { clientSecret, ...withoutSecret } = salesforce;
  assert.equal((await request('/salesforce', 'PUT', withoutSecret)).status, 400);
  assert.equal((await request('/salesforce', 'PUT', salesforce)).status, 200);
  assert.equal((await request('/salesforce', 'PUT', { ...withoutSecret, clientId: 'changed-client' })).status, 400);
  assert.equal((await request('/salesforce', 'PUT', { ...withoutSecret, accessTokenUrl: 'https://other.my.salesforce.com/services/oauth2/token' })).status, 400);
  assert.equal(state.writes, 1);
});

test('rejects unsafe token URLs, provider names, and malformed path identifiers', async () => {
  for (const accessTokenUrl of [
    'not-a-url', 'http://example.my.salesforce.com/services/oauth2/token',
    'https://127.0.0.1/services/oauth2/token', 'https://salesforce.com.attacker.test/services/oauth2/token',
    'https://example.my.salesforce.com:444/services/oauth2/token',
    'https://user:pass@example.my.salesforce.com/services/oauth2/token',
    'https://example.my.salesforce.com/other',
    'https://example.my.salesforce.com/services/oauth2/token?secret=value',
    'https://example.my.salesforce.com/services/oauth2/token#fragment',
  ]) {
    assert.equal((await request('/salesforce', 'PUT', { ...input(), accessTokenUrl })).status, 400);
  }
  assert.equal((await request('/unknown', 'PUT', { apiKey: secret() })).status, 404);
  const response = await fetch(baseUrl.replace(orgId, 'not-a-uuid'), { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 400);
  assert.equal(state.writes, 0);
});

test('missing encryption configuration fails explicitly without persisting plaintext', async () => {
  const key = process.env.CONNECTION_SECRET_KEY;
  delete process.env.CONNECTION_SECRET_KEY;
  try {
    assert.equal((await request('/spinergie', 'PUT', { apiKey: secret() })).status, 500);
    assert.equal(state.writes, 0);
  } finally {
    process.env.CONNECTION_SECRET_KEY = key;
  }
});

test('removes only the selected provider and preserves the other integration', async () => {
  assert.equal((await request('/salesforce', 'PUT', input())).status, 200);
  assert.equal((await request('/spinergie', 'PUT', { apiKey: secret() })).status, 200);
  let response = await request('/salesforce', 'DELETE');
  assert.equal(response.status, 200);
  let settings = await response.json();
  assert.equal(settings.salesforce.clientSecretConfigured, false);
  assert.equal(settings.spinergie.apiKeyConfigured, true);
  response = await request('/spinergie', 'DELETE');
  settings = await response.json();
  assert.equal(settings.spinergie.apiKeyConfigured, false);
  assert.equal(state.rows.length, 0);
});

const instanceUrl = 'https://example.my.salesforce.com';
const queryPrefix = `${instanceUrl}/services/data/v63.0/query`;
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const salesforceRecord = (id, overrides = {}) => ({
  attributes: { type: 'Opportunity', url: `/services/data/v63.0/sobjects/Opportunity/${id}` },
  Id: id, Opportunity_Number__c: `A${id.slice(-4)}`, StageName: 'Proposal', priority__c: 'High',
  Exclude_from_Market_Analyst_Reports1__c: false, Forecasted_Revenue__c: 1250000.5, Unselected_Field__c: 'drop me',
  ...overrides,
});

function extract(key = serviceKey, bearer = token) {
  return fetch(`${baseUrl}/salesforce/opportunities/extract`, {
    method: 'POST',
    headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(key ? { 'X-CapturePro-Service-Key': key } : {}) },
  });
}

async function withSalesforce(handler, run) {
  const realFetch = globalThis.fetch;
  const calls = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url);
    if (target.startsWith('http://127.0.0.1')) return realFetch(url, init);
    calls.push({ url: target, init });
    return handler(target, init, calls.length);
  });
  try {
    return await run(calls);
  } finally {
    fetchMock.mock.restore();
  }
}

async function configureSalesforce() {
  const configured = input();
  assert.equal((await request('/salesforce', 'PUT', configured)).status, 200);
  state.writes = 0;
  return configured;
}

test('extract requires the Capture-Pro service key before reading credentials or calling Salesforce', async () => {
  await configureSalesforce();
  await withSalesforce(() => { throw new Error('Salesforce must not be called'); }, async (calls) => {
    for (const key of ['', secret(), `${serviceKey}x`]) {
      const response = await extract(key);
      assert.equal(response.status, 403);
      assert.ok(!(await response.text()).includes(serviceKey));
    }
    assert.equal((await extract(serviceKey, '')).status, 401);
    assert.equal(calls.length, 0);
  });
});

test('extract is denied to non-administrators and for inactive assignments without calling Salesforce', async () => {
  await configureSalesforce();
  await withSalesforce(() => { throw new Error('Salesforce must not be called'); }, async (calls) => {
    state.moduleAdmin = false;
    for (const roles of [[], ['Capture-Pro Manager'], ['Capture-Pro Analyst']]) {
      state.globalRoles = roles;
      assert.equal((await extract()).status, 403);
    }
    state.moduleAdmin = true;
    state.activeModule = false;
    assert.equal((await extract()).status, 403);
    assert.equal(calls.length, 0);
  });
});

test('extract reports an unconfigured Salesforce integration explicitly', async () => {
  await withSalesforce(() => { throw new Error('Salesforce must not be called'); }, async (calls) => {
    const response = await extract();
    assert.equal(response.status, 409);
    assert.match(await response.text(), /Salesforce integration is not configured/);
    assert.equal(calls.length, 0);
  });
});

test('extract uses client credentials, follows trusted pagination, and returns only selected fields', async () => {
  const configured = await configureSalesforce();
  const accessToken = secret();
  await withSalesforce((url, init, call) => {
    if (call === 1) return jsonResponse({ access_token: accessToken, instance_url: instanceUrl, token_type: 'Bearer' });
    if (call === 2) return jsonResponse({ done: false, nextRecordsUrl: '/services/data/v63.0/query/01gABC-2000', records: [salesforceRecord('006000000000001AAA'), salesforceRecord('006000000000002AAA')] });
    return jsonResponse({ done: true, records: [salesforceRecord('006000000000002AAA', { StageName: 'Negotiation' }), salesforceRecord('006000000000003AAA')] });
  }, async (calls) => {
    const response = await extract();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text();
    assert.ok(!text.includes(configured.clientSecret));
    assert.ok(!text.includes(accessToken));
    const body = JSON.parse(text);
    assert.equal(body.records.length, 3);
    assert.equal(body.records[1].StageName, 'Negotiation');
    assert.equal(body.records[0].Forecasted_Revenue__c, 1250000.5);
    assert.equal(body.records[0].attributes, undefined);
    assert.equal(body.records[0].Unselected_Field__c, undefined);
    assert.equal(body.records[0].Service_Agreement_Business_Line__c, null);
    assert.equal(Object.keys(body.records[0]).length, 49);

    assert.equal(calls[0].url, configured.accessTokenUrl);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.redirect, 'error');
    const form = new URLSearchParams(calls[0].init.body.toString());
    assert.deepEqual(Object.fromEntries(form), { grant_type: 'client_credentials', client_id: configured.clientId, client_secret: configured.clientSecret });
    const query = new URL(calls[1].url);
    assert.equal(`${query.origin}${query.pathname}`, queryPrefix);
    assert.match(query.searchParams.get('q'), /^SELECT Id, AccountId, RecordTypeId, .* FROM Opportunity WHERE Exclude_from_Market_Analyst_Reports1__c = false AND priority__c != null AND Opportunity_Number__c != null AND \(RecordTypeId = '0120e000000UPzPAAW' OR Service_Agreement_Business_Line__c = 'Subsea & Floating Facilities'\)$/);
    assert.equal(calls[1].init.headers.Authorization, `Bearer ${accessToken}`);
    assert.equal(calls[1].init.redirect, 'error');
    assert.equal(calls[2].url, `${instanceUrl}/services/data/v63.0/query/01gABC-2000`);
  });
});

test('extract rejects Salesforce failures and untrusted endpoints without leaking credentials', async () => {
  const configured = await configureSalesforce();
  const scenarios = [
    [() => jsonResponse({ error: 'invalid_client', error_description: configured.clientSecret }, 400), 2, 1],
    [() => jsonResponse({ access_token: secret(), instance_url: 'http://example.my.salesforce.com' }), 2, 1],
    [() => jsonResponse({ access_token: secret(), instance_url: 'https://attacker.test' }), 2, 1],
    [() => jsonResponse({ access_token: secret(), instance_url: 'https://user:pass@example.my.salesforce.com' }), 2, 1],
    [() => jsonResponse({ access_token: secret(), instance_url: 'https://example.my.salesforce.com/redirect' }), 2, 1],
    [() => jsonResponse({ instance_url: instanceUrl }), 2, 1],
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({ message: 'denied' }, 401), 2, 2],
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({ done: false, nextRecordsUrl: 'https://attacker.test/services/data/v63.0/query/01g', records: [] }), 2, 2],
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({ done: false, nextRecordsUrl: '/services/data/v63.0/sobjects/User', records: [] }), 2, 2],
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({ done: true, records: [salesforceRecord('006000000000001AAA', { Description: { nested: true } })] }), 2, 2],
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({ done: true, records: [salesforceRecord('not-an-id')] }), 2, 2],
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({ done: true }), 2, 2],
    [() => { throw new TypeError('network failure'); }, 2, 1],
  ];
  for (const [handler, , expectedCalls] of scenarios) {
    await withSalesforce(handler, async (calls) => {
      const response = await extract();
      assert.equal(response.status, 502);
      const text = await response.text();
      assert.ok(!text.includes(configured.clientSecret));
      assert.equal(calls.length, expectedCalls);
    });
  }
});

function extractAccounts(key = serviceKey, bearer = token) {
  return fetch(`${baseUrl}/salesforce/accounts/extract`, {
    method: 'POST',
    headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(key ? { 'X-CapturePro-Service-Key': key } : {}) },
  });
}

test('account extract enforces the service key and administrator access before calling Salesforce', async () => {
  await configureSalesforce();
  await withSalesforce(() => { throw new Error('Salesforce must not be called'); }, async (calls) => {
    assert.equal((await extractAccounts('')).status, 403);
    assert.equal((await extractAccounts(secret())).status, 403);
    assert.equal((await extractAccounts(serviceKey, '')).status, 401);
    state.moduleAdmin = false;
    for (const roles of [[], ['Capture-Pro Manager'], ['Capture-Pro Analyst']]) {
      state.globalRoles = roles;
      assert.equal((await extractAccounts()).status, 403);
    }
    assert.equal(calls.length, 0);
  });
});

test('account extract runs the fixed Account query with pagination and returns only the four selected fields', async () => {
  const configured = await configureSalesforce();
  const accessToken = secret();
  const account = (id, overrides = {}) => ({
    attributes: { type: 'Account', url: `/services/data/v63.0/sobjects/Account/${id}` },
    Id: id, Name: `Account ${id.slice(-4)}`, Type: 'Customer', Company_Short_Name__c: `AC${id.slice(-4)}`, Phone: '+1 555 0100', ...overrides,
  });
  await withSalesforce((url, init, call) => {
    if (call === 1) return jsonResponse({ access_token: accessToken, instance_url: instanceUrl });
    if (call === 2) return jsonResponse({ done: false, nextRecordsUrl: '/services/data/v63.0/query/01gACC-2000', records: [account('001000000000001AAA'), account('001000000000002AAA', { Type: null })] });
    return jsonResponse({ done: true, records: [account('001000000000003AAA', { Company_Short_Name__c: null })] });
  }, async (calls) => {
    const response = await extractAccounts();
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes(configured.clientSecret));
    assert.ok(!text.includes(accessToken));
    const body = JSON.parse(text);
    assert.equal(body.records.length, 3);
    assert.deepEqual(Object.keys(body.records[0]).sort(), ['Company_Short_Name__c', 'Id', 'Name', 'Type']);
    assert.equal(body.records[1].Type, null);
    assert.equal(body.records[0].Phone, undefined);
    assert.equal(new URL(calls[1].url).searchParams.get('q'), 'SELECT Id, Name, Type, Company_Short_Name__c FROM Account');
    assert.equal(calls[1].init.headers.Authorization, `Bearer ${accessToken}`);
    assert.equal(calls[2].url, `${instanceUrl}/services/data/v63.0/query/01gACC-2000`);
  });
});

test('account extract rejects Salesforce failures and malformed account records', async () => {
  const configured = await configureSalesforce();
  for (const [handler, message] of [
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({}, 400), /account query \(400\)/],
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({ done: true, records: [{ Id: 'bad', Name: 'X' }] }), /account without a valid Id/],
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({ done: true, records: [{ Id: '001000000000001AAA', Name: { nested: true } }] }), /unsupported account field value/],
  ]) {
    await withSalesforce(handler, async () => {
      const response = await extractAccounts();
      assert.equal(response.status, 502);
      const text = await response.text();
      assert.match(text, message);
      assert.ok(!text.includes(configured.clientSecret));
    });
  }
});

function extractCompetitors(key = serviceKey, bearer = token) {
  return fetch(`${baseUrl}/salesforce/competitors/extract`, {
    method: 'POST',
    headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...(key ? { 'X-CapturePro-Service-Key': key } : {}) },
  });
}

test('competitor extract enforces the service key and administrator access before calling Salesforce', async () => {
  await configureSalesforce();
  await withSalesforce(() => { throw new Error('Salesforce must not be called'); }, async (calls) => {
    assert.equal((await extractCompetitors('')).status, 403);
    assert.equal((await extractCompetitors(secret())).status, 403);
    state.moduleAdmin = false;
    state.globalRoles = ['Capture-Pro Analyst'];
    assert.equal((await extractCompetitors()).status, 403);
    assert.equal(calls.length, 0);
  });
});

test('competitor extract runs the fixed Project_Competitor_Details__c query and keeps native Salesforce types', async () => {
  const configured = await configureSalesforce();
  const accessToken = secret();
  await withSalesforce((url, init, call) => {
    if (call === 1) return jsonResponse({ access_token: accessToken, instance_url: instanceUrl });
    return jsonResponse({ done: true, records: [{
      attributes: { type: 'Project_Competitor_Details__c' }, Id: 'a0B000000000001AAA', Comments__c: 'Aggressive pricing',
      Competitor_Vessel__c: 'Seven Borealis', Competitor_Yard__c: null, Competitor__c: '001000000000001AAA', Won__c: true,
      Competitor_Name__c: 'Subsea 7', Competitor_s_Bid_Price__c: 125000000.5, Opportunity__c: '006000000000001AAA', OwnerId: '005000000000001AAA',
    }] });
  }, async (calls) => {
    const response = await extractCompetitors();
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes(configured.clientSecret));
    assert.ok(!text.includes(accessToken));
    const [record] = JSON.parse(text).records;
    assert.deepEqual(Object.keys(record).sort(), ['Comments__c', 'Competitor_Name__c', 'Competitor_Vessel__c', 'Competitor_Yard__c', 'Competitor__c', 'Competitor_s_Bid_Price__c', 'Id', 'Opportunity__c', 'Won__c']);
    assert.equal(record.Won__c, true);
    assert.equal(record.Competitor_s_Bid_Price__c, 125000000.5);
    assert.equal(record.Competitor_Yard__c, null);
    assert.equal(new URL(calls[1].url).pathname, '/services/data/v63.0/query');
    assert.equal(new URL(calls[1].url).searchParams.get('q'), 'SELECT Id, Comments__c, Competitor_Vessel__c, Competitor_Yard__c, Competitor__c, Won__c, Competitor_Name__c, Competitor_s_Bid_Price__c, Opportunity__c FROM Project_Competitor_Details__c');
  });
});

test('competitor extract rejects query failures and malformed records without leaking credentials', async () => {
  const configured = await configureSalesforce();
  for (const [handler, message] of [
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({}, 400), /competitor query \(400\)/],
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({ done: true, records: [{ Id: '' }] }), /competitor without a valid Id/],
  ]) {
    await withSalesforce(handler, async () => {
      const response = await extractCompetitors();
      assert.equal(response.status, 502);
      const text = await response.text();
      assert.match(text, message);
      assert.ok(!text.includes(configured.clientSecret));
    });
  }
});

function extractBidBudgets(key = serviceKey, bearer = token) {
  return fetch(`${baseUrl}/salesforce/bid-budgets/extract`, {
    method: 'POST',
    headers: { ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...(key ? { 'X-CapturePro-Service-Key': key } : {}) },
  });
}

test('bid budget extract enforces the service key and administrator access before calling Salesforce', async () => {
  await configureSalesforce();
  await withSalesforce(() => { throw new Error('Salesforce must not be called'); }, async (calls) => {
    assert.equal((await extractBidBudgets('')).status, 403);
    assert.equal((await extractBidBudgets(secret())).status, 403);
    state.moduleAdmin = false;
    state.globalRoles = ['Capture-Pro Manager'];
    assert.equal((await extractBidBudgets()).status, 403);
    assert.equal(calls.length, 0);
  });
});

test('bid budget extract runs the fixed Opportunity_Bid_Budget__c query with Id and keeps native Salesforce types', async () => {
  const configured = await configureSalesforce();
  const accessToken = secret();
  await withSalesforce((url, init, call) => {
    if (call === 1) return jsonResponse({ access_token: accessToken, instance_url: instanceUrl });
    return jsonResponse({ done: true, records: [{
      attributes: { type: 'Opportunity_Bid_Budget__c' }, Id: 'a0C000000000001AAA', Opportunity__c: '006000000000001AAA',
      Actual_Bid_Cost__c: 1250000.25, Compensation__c: null, Opportunity_Bid_Budget_Recovery_Year__c: '2026', Budgeted_Hours__c: 8200,
      Forecasted_Spend__c: 1400000, Actual_Bid_Budget__c: 1500000, Additional_Pre_Contract_1__c: 0, Additional_Pre_Contract_2__c: null,
      Additional_Pre_Contract_3__c: null, Forecast_Purpose__c: 'FEED', PG1_Pre_Contract__c: true, OwnerId: '005000000000001AAA',
    }] });
  }, async (calls) => {
    const response = await extractBidBudgets();
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes(configured.clientSecret));
    assert.ok(!text.includes(accessToken));
    const [record] = JSON.parse(text).records;
    assert.deepEqual(Object.keys(record).sort(), [
      'Actual_Bid_Budget__c', 'Actual_Bid_Cost__c', 'Additional_Pre_Contract_1__c', 'Additional_Pre_Contract_2__c', 'Additional_Pre_Contract_3__c',
      'Budgeted_Hours__c', 'Compensation__c', 'Forecast_Purpose__c', 'Forecasted_Spend__c', 'Id', 'Opportunity_Bid_Budget_Recovery_Year__c',
      'Opportunity__c', 'PG1_Pre_Contract__c',
    ]);
    assert.equal(record.Actual_Bid_Cost__c, 1250000.25);
    assert.equal(record.PG1_Pre_Contract__c, true);
    assert.equal(record.Compensation__c, null);
    assert.equal(new URL(calls[1].url).pathname, '/services/data/v63.0/query');
    assert.equal(new URL(calls[1].url).searchParams.get('q'), 'SELECT Id, Opportunity__c, Actual_Bid_Cost__c, Compensation__c, Opportunity_Bid_Budget_Recovery_Year__c, Budgeted_Hours__c, Forecasted_Spend__c, Actual_Bid_Budget__c, Additional_Pre_Contract_1__c, Additional_Pre_Contract_2__c, Additional_Pre_Contract_3__c, Forecast_Purpose__c, PG1_Pre_Contract__c FROM Opportunity_Bid_Budget__c');
  });
});

test('bid budget extract rejects query failures and malformed records without leaking credentials', async () => {
  const configured = await configureSalesforce();
  for (const [handler, message] of [
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({}, 400), /bid budget query \(400\)/],
    [(url, init, call) => call === 1 ? jsonResponse({ access_token: secret(), instance_url: instanceUrl }) : jsonResponse({ done: true, records: [{ Id: 'a0C000000000001AAA', Actual_Bid_Cost__c: { amount: 1 } }] }), /unsupported bid budget field value/],
  ]) {
    await withSalesforce(handler, async () => {
      const response = await extractBidBudgets();
      assert.equal(response.status, 502);
      const text = await response.text();
      assert.match(text, message);
      assert.ok(!text.includes(configured.clientSecret));
    });
  }
});
function extractFabricationYards(key = serviceKey, bearer = token) {
  return fetch(`${baseUrl}/salesforce/fabrication-yards/extract`, {
    method: 'POST',
    headers: { ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...(key ? { 'X-CapturePro-Service-Key': key } : {}) },
  });
}

const fabricationYardDescribe = {
  fields: [
    { name: 'Id', label: 'Record ID', type: 'id' },
    { name: 'Name', label: 'Fabrication Yard Name', type: 'string' },
    { name: 'Country__c', label: 'Country', type: 'picklist' },
    { name: 'Capacity_Tonnes__c', label: 'Capacity (t)', type: 'double' },
    { name: 'Active__c', label: 'Active', type: 'boolean' },
    { name: 'Owner__c', label: 'Owner', type: 'reference' },
    { name: 'Yard_Address__c', label: 'Yard Address', type: 'address' },
    { name: 'Yard_Location__c', label: 'Yard Location', type: 'location' },
    { name: 'Logo__c', label: 'Logo', type: 'base64' },
    { name: 'Secret_Code__c', label: 'Secret Code', type: 'encryptedstring' },
    { name: 'Old_Field__c', label: 'Old', type: 'string', deprecatedAndHidden: true },
  ],
};

test('fabrication yard extract enforces the service key and administrator access before calling Salesforce', async () => {
  await configureSalesforce();
  await withSalesforce(() => { throw new Error('Salesforce must not be called'); }, async (calls) => {
    assert.equal((await extractFabricationYards('')).status, 403);
    assert.equal((await extractFabricationYards(secret())).status, 403);
    state.moduleAdmin = false;
    state.globalRoles = ['Capture-Pro Analyst'];
    assert.equal((await extractFabricationYards()).status, 403);
    assert.equal(calls.length, 0);
  });
});

test('fabrication yard extract describes the object and queries every scalar field with native Salesforce types', async () => {
  const configured = await configureSalesforce();
  const accessToken = secret();
  await withSalesforce((url, init, call) => {
    if (call === 1) return jsonResponse({ access_token: accessToken, instance_url: instanceUrl });
    if (call === 2) return jsonResponse(fabricationYardDescribe);
    return jsonResponse({ done: true, records: [{
      attributes: { type: 'Fabrication_Yard__c' }, Id: 'a0D000000000001AAA', Name: 'Batam Yard', Country__c: 'Indonesia',
      Capacity_Tonnes__c: 45000.5, Active__c: true, Owner__c: null, Unrequested__c: 'dropped',
    }] });
  }, async (calls) => {
    const response = await extractFabricationYards();
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes(configured.clientSecret));
    assert.ok(!text.includes(accessToken));
    const body = JSON.parse(text);
    assert.deepEqual(body.fields.map((field) => field.name), ['Id', 'Name', 'Country__c', 'Capacity_Tonnes__c', 'Active__c', 'Owner__c']);
    assert.deepEqual(body.fields[3], { name: 'Capacity_Tonnes__c', label: 'Capacity (t)', type: 'double' });
    const [record] = body.records;
    assert.deepEqual(Object.keys(record).sort(), ['Active__c', 'Capacity_Tonnes__c', 'Country__c', 'Id', 'Name', 'Owner__c']);
    assert.equal(record.Active__c, true);
    assert.equal(record.Capacity_Tonnes__c, 45000.5);
    assert.equal(new URL(calls[1].url).pathname, '/services/data/v63.0/sobjects/Fabrication_Yard__c/describe');
    assert.equal(calls[1].init.redirect, 'error');
    assert.equal(new URL(calls[2].url).pathname, '/services/data/v63.0/query');
    assert.equal(new URL(calls[2].url).searchParams.get('q'), 'SELECT Id, Name, Country__c, Capacity_Tonnes__c, Active__c, Owner__c FROM Fabrication_Yard__c');
  });
});

test('fabrication yard extract rejects unsafe or invalid field definitions before querying', async () => {
  const configured = await configureSalesforce();
  const tooMany = { fields: [{ name: 'Id', label: 'Id', type: 'id' }, ...Array.from({ length: 500 }, (_, index) => ({ name: `Field_${index}__c`, label: `F${index}`, type: 'string' }))] };
  for (const [describe, status, message] of [
    [{ fields: [{ name: 'Id', label: 'Id', type: 'id' }, { name: 'Name FROM Account', label: 'x', type: 'string' }] }, 200, /invalid fabrication yard field definition/],
    [{ fields: [{ name: 'Name', label: 'Name', type: 'string' }] }, 200, /did not describe a fabrication yard Id field/],
    [{ fields: 'none' }, 200, /invalid fabrication yard describe response/],
    [tooMany, 200, /more than 500 fabrication yard fields/],
    [{}, 404, /fabrication yard describe request \(404\)/],
  ]) {
    await withSalesforce((url, init, call) => {
      if (call === 1) return jsonResponse({ access_token: secret(), instance_url: instanceUrl });
      if (call === 2) return jsonResponse(describe, status);
      throw new Error('The query must not run');
    }, async (calls) => {
      const response = await extractFabricationYards();
      assert.equal(response.status, 502);
      const text = await response.text();
      assert.match(text, message);
      assert.ok(!text.includes(configured.clientSecret));
      assert.equal(calls.length, 2);
    });
  }
});

function extractVessels(key = serviceKey, bearer = token) {
  return fetch(`${baseUrl}/salesforce/vessels/extract`, {
    method: 'POST',
    headers: { ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...(key ? { 'X-CapturePro-Service-Key': key } : {}) },
  });
}

test('vessel extract enforces the service key and administrator access before calling Salesforce', async () => {
  await configureSalesforce();
  await withSalesforce(() => { throw new Error('Salesforce must not be called'); }, async (calls) => {
    assert.equal((await extractVessels('')).status, 403);
    assert.equal((await extractVessels(secret())).status, 403);
    state.moduleAdmin = false;
    state.globalRoles = ['Capture-Pro Manager'];
    assert.equal((await extractVessels()).status, 403);
    assert.equal(calls.length, 0);
  });
});

test('vessel extract describes Vessel__c and queries every scalar field with native Salesforce types', async () => {
  const configured = await configureSalesforce();
  const accessToken = secret();
  await withSalesforce((url, init, call) => {
    if (call === 1) return jsonResponse({ access_token: accessToken, instance_url: instanceUrl });
    if (call === 2) {
      return jsonResponse({ fields: [
        { name: 'Id', label: 'Record ID', type: 'id' },
        { name: 'Name', label: 'Vessel Name', type: 'string' },
        { name: 'Crane_Capacity__c', label: 'Crane Capacity', type: 'double' },
        { name: 'DP_Class__c', label: 'DP Class', type: 'picklist' },
        { name: 'Home_Port__c', label: 'Home Port', type: 'location' },
      ] });
    }
    return jsonResponse({ done: true, records: [{ attributes: { type: 'Vessel__c' }, Id: 'a0E000000000001AAA', Name: 'DLV 2000', Crane_Capacity__c: 2200, DP_Class__c: 'DP3' }] });
  }, async (calls) => {
    const response = await extractVessels();
    assert.equal(response.status, 200);
    const text = await response.text();
    assert.ok(!text.includes(configured.clientSecret));
    assert.ok(!text.includes(accessToken));
    const body = JSON.parse(text);
    assert.deepEqual(body.fields.map((field) => field.name), ['Id', 'Name', 'Crane_Capacity__c', 'DP_Class__c']);
    assert.deepEqual(body.records[0], { Id: 'a0E000000000001AAA', Name: 'DLV 2000', Crane_Capacity__c: 2200, DP_Class__c: 'DP3' });
    assert.equal(new URL(calls[1].url).pathname, '/services/data/v63.0/sobjects/Vessel__c/describe');
    assert.equal(new URL(calls[2].url).searchParams.get('q'), 'SELECT Id, Name, Crane_Capacity__c, DP_Class__c FROM Vessel__c');
  });
});
