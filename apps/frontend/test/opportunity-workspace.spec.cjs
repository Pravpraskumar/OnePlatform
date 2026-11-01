const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../src/pages/app/capturepro/opportunityWorkspace.ts');
const compiled = new Module(filename, module);
compiled._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { opportunityWorkspaceKey, parseWorkspaceSelection, opportunityLifecycle } = compiled.exports;
const today = new Date('2026-10-23T12:00:00Z');
const row = (fields) => ({ fields });

test('workspace preference keys isolate organisation and user and encode delimiters', () => {
  assert.notEqual(opportunityWorkspaceKey('org-1', 'user-1'), opportunityWorkspaceKey('org-1', 'user-2'));
  assert.notEqual(opportunityWorkspaceKey('org-1', 'user-1'), opportunityWorkspaceKey('org-2', 'user-1'));
  assert.notEqual(opportunityWorkspaceKey('org:a', 'b'), opportunityWorkspaceKey('org', 'a:b'));
});

test('workspace selection contains unique Salesforce IDs, not record snapshots', () => {
  assert.deepEqual(parseWorkspaceSelection(null), []);
  assert.deepEqual(parseWorkspaceSelection('["006000000000001AAA","006000000000001AAA"]'), ['006000000000001AAA']);
  for (const invalid of ['{}', 'null', '[42]', '[{"id":"006000000000001AAA"}]', '["untrusted/path"]', 'broken']) {
    assert.throws(() => parseWorkspaceSelection(invalid));
  }
  assert.throws(() => parseWorkspaceSelection(JSON.stringify(Array(10001).fill('006000000000001AAA'))));
});

test('future ITT date suggests Pre-ITT with an exact UTC day countdown', () => {
  assert.deepEqual(opportunityLifecycle(row({ RFP_Date__c: '2026-10-30', ITT_Received__c: false }), today), {
    phase: 'Pre-ITT', ittDate: '2026-10-30', received: false, daysToItt: 7,
  });
});

test('ITT date reached suggests Post-ITT but never fabricates receipt confirmation', () => {
  for (const date of ['2026-10-23', '2026-10-22']) {
    const result = opportunityLifecycle(row({ RFP_Date__c: date, ITT_Received__c: false }), today);
    assert.equal(result.phase, 'Post-ITT');
    assert.equal(result.received, false);
  }
});

test('confirmed Salesforce receipt takes precedence over a future or missing ITT date', () => {
  for (const date of ['2026-12-01', null]) {
    assert.equal(opportunityLifecycle(row({ RFP_Date__c: date, ITT_Received__c: true }), today).phase, 'Post-ITT');
  }
});

test('missing, malformed or impossible dates do not fabricate a lifecycle phase', () => {
  for (const date of [null, undefined, '2026-02-30', '2026-13-01', 'not-a-date', true]) {
    const result = opportunityLifecycle(row({ RFP_Date__c: date, ITT_Received__c: 'true' }), today);
    assert.equal(result.phase, 'ITT date required');
    assert.equal(result.ittDate, null);
    assert.equal(result.received, false);
  }
});