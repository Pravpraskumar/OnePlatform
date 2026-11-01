const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

function loadSource(relativePath, dependencies = {}) {
  const filename = path.resolve(__dirname, '../src', relativePath);
  const compiled = new Module(filename, module);
  compiled.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = compiled.require.bind(compiled);
  compiled.require = (name) => dependencies[name] ?? originalRequire(name);
  compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, filename);
  return compiled.exports;
}

const graph = loadSource('lib/sharePointGraph.ts');
const accessToken = randomBytes(32).toString('hex');
const site = { id: 'approved-site' };
const libraries = { value: [{ id: 'approved-drive', name: 'Documents', webUrl: `${graph.sharePointTarget.siteUrl}/Shared%20Documents` }] };
const folder = { id: 'approved-folder', folder: {} };

function graphMock(responses) {
  const calls = [];
  return {
    calls,
    request: async (url, options) => {
      calls.push({ url, options });
      assert.ok(responses.length, 'Unexpected Graph request');
      const next = responses.shift();
      return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
    },
  };
}

test('resolves only the approved site/library/folder without writing', async () => {
  const mock = graphMock([{ body: site }, { body: libraries }, { body: folder }]);
  assert.deepEqual(await graph.resolveSharePointFolder(accessToken, mock.request), { driveId: 'approved-drive', itemId: 'approved-folder' });
  assert.equal(mock.calls.length, 3);
  assert.match(mock.calls[0].url, /sites\/mcdermottinc.sharepoint.com:\/sites\/SPMATTeam/);
  assert.ok(mock.calls[2].url.includes('General/SMAT%20Documents/Project%20Setup/McDermott_CIS_Test'));
  for (const call of mock.calls) {
    assert.equal(new URL(call.url).origin, 'https://graph.microsoft.com');
    assert.equal(call.options.headers.Authorization, `Bearer ${accessToken}`);
    assert.equal(call.options.credentials, 'omit');
    assert.equal(call.options.redirect, 'error');
    assert.equal(call.options.method, undefined);
  }
});

test('creates sample.json with synthetic data and fail-on-conflict semantics', async () => {
  const mock = graphMock([{ body: site }, { body: libraries }, { body: folder }, { body: { name: 'sample.json', file: {} } }]);
  await graph.uploadSharePointSample(accessToken, mock.request);
  const upload = mock.calls[3];
  assert.equal(upload.options.method, 'PUT');
  assert.equal(upload.options.headers['Content-Type'], 'application/json');
  assert.match(upload.url, /approved-drive\/items\/approved-folder:\/sample.json:\/content\?@microsoft.graph.conflictBehavior=fail$/);
  assert.deepEqual(JSON.parse(upload.options.body).data, []);
  assert.equal(upload.options.body.includes(accessToken), false);
});

test('denied folder access never issues a write or exposes provider error details', async () => {
  const mock = graphMock([{ body: site }, { body: libraries }, { status: 403, body: { error: accessToken } }]);
  await assert.rejects(graph.uploadSharePointSample(accessToken, mock.request), /SharePoint access denied/);
  assert.equal(mock.calls.length, 3);
  assert.equal(mock.calls.some(call => call.options.method === 'PUT'), false);
});

test('does not follow library pages to another host or site', async () => {
  for (const nextLink of ['https://unapproved.example/v1.0/drives', 'https://graph.microsoft.com/v1.0/sites/another-site/drives']) {
    const mock = graphMock([{ body: site }, { body: { value: [], '@odata.nextLink': nextLink } }]);
    await assert.rejects(graph.resolveSharePointFolder(accessToken, mock.request), /unexpected library page/);
    assert.equal(mock.calls.length, 2);
  }
});

test('does not resolve a similarly named library on an unrelated site', async () => {
  const mock = graphMock([{ body: site }, { body: { value: [{ ...libraries.value[0], webUrl: 'https://mcdermottinc.sharepoint.com/sites/Other/Shared%20Documents' }] } }]);
  await assert.rejects(graph.resolveSharePointFolder(accessToken, mock.request), /library was not found/);
  assert.equal(mock.calls.length, 2);
});

test('handles file conflicts, write denial, expired tokens, and throttling without retrying writes', async () => {
  for (const [status, message] of [[409, /already exists/], [403, /access denied/], [401, /sign-in has expired/], [429, /throttling/]]) {
    const mock = graphMock([{ body: site }, { body: libraries }, { body: folder }, { status, body: {} }]);
    await assert.rejects(graph.uploadSharePointSample(accessToken, mock.request), message);
    assert.equal(mock.calls.length, 4);
  }
});

test('rejects non-folder destinations and unconfirmed uploads', async () => {
  const notFolder = graphMock([{ body: site }, { body: libraries }, { body: { id: 'not-a-folder', file: {} } }]);
  await assert.rejects(graph.uploadSharePointSample(accessToken, notFolder.request), /not a folder/);
  const unconfirmed = graphMock([{ body: site }, { body: libraries }, { body: folder }, { body: {} }]);
  await assert.rejects(graph.uploadSharePointSample(accessToken, unconfirmed.request), /did not confirm creation/);
});

const configuration = {
  enabled: true,
  tenantId: '11111111-1111-4111-8111-111111111111',
  clientId: '22222222-2222-4222-8222-222222222222',
  organisationId: 'approved-org',
};

function authFixture(context, options = {}) {
  const storage = new Map();
  const calls = {};
  const account = { homeAccountId: 'test-account' };
  const result = { tenantId: configuration.tenantId, account, accessToken };
  class MockClient {
    constructor(config) { calls.configuration = config; }
    async initialize() {}
    async handleRedirectPromise() { calls.redirectHandled = true; return options.redirectResult ?? result; }
    setActiveAccount(value) { calls.activeAccount = value; }
    getActiveAccount() { return calls.activeAccount; }
    async acquireTokenSilent(request) { calls.silent = request; if (options.expired) throw new Error('interaction required'); return result; }
    async loginRedirect(request) { calls.login = request; }
    async clearCache() { calls.cleared = true; delete calls.activeAccount; }
  }
  const priorWindow = global.window;
  const priorStorage = global.sessionStorage;
  global.window = { isSecureContext: true, crypto: { subtle: {} }, location: { origin: 'http://localhost:5173' } };
  global.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  context.after(() => { global.window = priorWindow; global.sessionStorage = priorStorage; });
  const auth = loadSource('auth/sharePointConnection.ts', {
    '@azure/msal-browser': { PublicClientApplication: MockClient, BrowserCacheLocation: { MemoryStorage: 'memoryStorage', SessionStorage: 'sessionStorage' } },
  });
  const connection = new auth.SharePointConnection(configuration, 'approved-org', 'capture-pro');
  return { auth, connection, calls, storage };
}

test('requires enabled configuration, valid app IDs, matching organisation and a secure context', (context) => {
  const { auth } = authFixture(context);
  for (const invalid of [{ ...configuration, enabled: false }, { ...configuration, clientId: '' }, { ...configuration, tenantId: 'common' }, { ...configuration, clientId: '00000000-0000-0000-0000-000000000000' }]) {
    assert.equal(auth.isSharePointConfigured(invalid, 'approved-org'), false);
    assert.throws(() => new auth.SharePointConnection(invalid, 'approved-org', 'capture-pro'), /not configured/);
  }
  assert.equal(auth.isSharePointConfigured(configuration, 'another-org'), false);
  global.window.isSecureContext = false;
  assert.throws(() => new auth.SharePointConnection(configuration, 'approved-org', 'capture-pro'), /secure browser context/);
});

test('uses isolated single-tenant MSAL, selected-site scopes and in-memory token storage', async (context) => {
  const { connection, calls, storage } = authFixture(context);
  assert.equal(await connection.resume(), false);
  await assert.rejects(connection.getAccessToken(), /Connect SharePoint/);
  await connection.connect();
  assert.equal(calls.configuration.auth.authority, `https://login.microsoftonline.com/${configuration.tenantId}`);
  assert.equal(calls.configuration.auth.redirectUri, 'http://localhost:5173/app/product/Capture-Pro/integrations');
  assert.equal(calls.configuration.cache.cacheLocation, 'memoryStorage');
  assert.deepEqual(calls.login.scopes, ['https://graph.microsoft.com/Sites.Selected']);
  assert.equal(calls.login.prompt, 'select_account');
  assert.equal(JSON.stringify([...storage]).includes(accessToken), false);
  assert.equal(await connection.resume(), true);
  assert.equal(await connection.getAccessToken(), accessToken);
  assert.equal(storage.size, 0);
  await connection.disconnect();
  assert.equal(calls.cleared, true);
  await assert.rejects(connection.getAccessToken(), /Connect SharePoint/);
});

test('rejects redirected connections for another organisation, product or expired context', async (context) => {
  const { connection, storage, calls } = authFixture(context);
  for (const pending of [
    { organisationId: 'another-org', productId: 'capture-pro', expiresAt: Date.now() + 100000 },
    { organisationId: 'approved-org', productId: 'another-product', expiresAt: Date.now() + 100000 },
    { organisationId: 'approved-org', productId: 'capture-pro', expiresAt: 0 },
  ]) {
    storage.set('captureProSharePointSignIn', JSON.stringify(pending));
    await assert.rejects(connection.resume(), /context changed or expired/);
    assert.equal(storage.size, 0);
    assert.equal(calls.redirectHandled, undefined);
  }
});

test('rejects a Microsoft account from an unexpected tenant', async (context) => {
  const { connection } = authFixture(context, { redirectResult: { tenantId: 'unapproved-tenant', account: {}, accessToken } });
  await connection.connect();
  await assert.rejects(connection.resume(), /configured tenant/);
  await assert.rejects(connection.getAccessToken(), /Connect SharePoint/);
});

test('expired consent cannot silently reuse a previous connection', async (context) => {
  const { connection } = authFixture(context, { expired: true });
  await connection.connect();
  assert.equal(await connection.resume(), true);
  await assert.rejects(connection.getAccessToken(), /consent or sign-in is required/);
  await assert.rejects(connection.getAccessToken(), /Connect SharePoint/);
});