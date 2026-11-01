require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { afterEach, mock, test } = require('node:test');
const { AzureCliCredential } = require('@azure/identity');
const { FoundryClient } = require('../dist/products/foundry-client');

const endpoint = 'https://synthetic.services.ai.azure.com/api/projects/synthetic';
afterEach(() => mock.restoreAll());

test('Foundry refuses unsafe endpoints and unsupported identities before acquiring tokens', () => {
  for (const value of ['http://synthetic.services.ai.azure.com/api/projects/test', 'https://example.test/api/projects/test', `${endpoint}?key=secret`, 'https://localhost/api/projects/test']) {
    assert.throws(() => new FoundryClient(value, { id: 'asst_synthetic' }, 'azure-cli'));
  }
  assert.throws(() => new FoundryClient(endpoint, { id: 'asst_synthetic' }, 'unapproved'));
});

test('Foundry resolves a unique existing agent by name and accepts only reviewed knowledge tools', async () => {
  const token = randomBytes(24).toString('hex');
  mock.method(AzureCliCredential.prototype, 'getToken', async () => ({ token, expiresOnTimestamp: Date.now() + 600000 }));
  const fetchMock = mock.method(global, 'fetch', async (url, options) => {
    assert.ok(url.startsWith(`${endpoint}/assistants?limit=100`));
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    return new Response(JSON.stringify({ data: [{ id: 'asst_synthetic', name: 'synthetic-agent', tools: [{ type: 'file_search' }] }], has_more: false }), { headers: { 'content-type': 'application/json' } });
  });
  const client = new FoundryClient(endpoint, { name: 'synthetic-agent' }, 'azure-cli');
  assert.equal((await client.agent()).id, 'asst_synthetic');
  fetchMock.mock.mockImplementation(async () => new Response(JSON.stringify({ data: [{ id: 'asst_synthetic', name: 'synthetic-agent', tools: [{ type: 'function' }] }], has_more: false }), { headers: { 'content-type': 'application/json' } }));
  await assert.rejects(client.agent(), /outside the approved read-only/);
});

test('Foundry never returns credential or provider error content', async () => {
  const secret = randomBytes(24).toString('hex');
  mock.method(AzureCliCredential.prototype, 'getToken', async () => { throw new Error(secret); });
  await assert.rejects(new FoundryClient(endpoint, { id: 'asst_synthetic' }, 'azure-cli').agent(), (error) => !error.message.includes(secret));
  mock.restoreAll();
  mock.method(AzureCliCredential.prototype, 'getToken', async () => ({ token: secret, expiresOnTimestamp: Date.now() + 600000 }));
  mock.method(global, 'fetch', async () => new Response(secret, { status: 403 }));
  await assert.rejects(new FoundryClient(endpoint, { id: 'asst_synthetic' }, 'azure-cli').agent(), (error) => !error.message.includes(secret) && error.getStatus() === 502);
});