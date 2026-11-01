require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { afterEach, mock, test } = require('node:test');
const { fetchSpinergieVesselCharters, fetchSpinergieVesselSpecs, SPINERGIE_VESSEL_CHARTERS_URL, SPINERGIE_VESSEL_SPECS_URL } = require('../dist/organisations/spinergie-vessel-extract');

afterEach(() => mock.restoreAll());

test('Spinergie charters use only the fixed charter URL and the saved-key header without redirects', async () => {
  const key = randomBytes(24).toString('hex');
  mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, SPINERGIE_VESSEL_CHARTERS_URL);
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { Accept: 'application/json', apiKey: key });
    return new Response('[{"vesselId":123,"vesselTitle":"Synthetic vessel"}]', { headers: { 'content-type': 'application/json' } });
  });
  assert.deepEqual(await fetchSpinergieVesselCharters(key), [{ vesselId: 123, vesselTitle: 'Synthetic vessel' }]);
});

test('Spinergie charter provider failures never expose the response body', async () => {
  const key = randomBytes(24).toString('hex');
  mock.method(global, 'fetch', async () => new Response(key, { status: 401 }));
  await assert.rejects(fetchSpinergieVesselCharters(key), (error) => error.getStatus() === 502 && !error.message.includes(key));
});

test('Spinergie uses the fixed HTTPS endpoint and server-only apiKey header with redirects blocked', async () => {
  const key = randomBytes(24).toString('hex');
  mock.method(global, 'fetch', async (url, options) => {
    assert.equal(url, SPINERGIE_VESSEL_SPECS_URL);
    assert.equal(options.redirect, 'error');
    assert.deepEqual(options.headers, { Accept: 'application/json', apiKey: key });
    assert.ok(options.signal);
    return new Response(JSON.stringify([{ vesselId: 123, vessel: 'Synthetic vessel' }]), { headers: { 'content-type': 'application/json' } });
  });
  assert.deepEqual(await fetchSpinergieVesselSpecs(key), [{ vesselId: 123, vessel: 'Synthetic vessel' }]);
});

test('Spinergie provider failures never expose provider bodies or credential-bearing exceptions', async () => {
  const key = randomBytes(24).toString('hex');
  for (const status of [401, 403, 429, 500]) {
    mock.method(global, 'fetch', async () => new Response(key, { status }));
    await assert.rejects(fetchSpinergieVesselSpecs(key), (error) => !error.message.includes(key) && error.getStatus() === 502);
    mock.restoreAll();
  }
  mock.method(global, 'fetch', async () => { throw new Error(key); });
  await assert.rejects(fetchSpinergieVesselSpecs(key), (error) => !error.message.includes(key) && error.getStatus() === 502);
});

test('Spinergie rejects non-JSON, empty, wrapped/paginated and oversized response bodies', async () => {
  for (const body of ['[]', '{}', '{"results":[]}', 'invalid JSON']) {
    mock.method(global, 'fetch', async () => new Response(body, { headers: { 'content-type': 'application/json' } }));
    await assert.rejects(fetchSpinergieVesselSpecs('synthetic-key'));
    mock.restoreAll();
  }
  mock.method(global, 'fetch', async () => new Response('[]', { headers: { 'content-type': 'text/html' } }));
  await assert.rejects(fetchSpinergieVesselSpecs('synthetic-key'));
  mock.restoreAll();
  mock.method(global, 'fetch', async () => new Response(new Uint8Array(32 * 1024 * 1024 + 1), { headers: { 'content-type': 'application/json' } }));
  await assert.rejects(fetchSpinergieVesselSpecs('synthetic-key'), /response size/);
});