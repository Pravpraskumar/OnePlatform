require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { beforeEach, mock, test } = require('node:test');
const { ConfigService } = require('@nestjs/config');
const { getTableName } = require('drizzle-orm');
const { PgDialect } = require('drizzle-orm/pg-core');
const {
  deriveStageName, matchesCaptureProExtract, parseSalesforceRecords, salesforceOpportunityFields, transformSalesforceOpportunity,
} = require('../dist/salesforce/salesforce-opportunity.transform');
const { SalesforceOpportunitiesService, SYNC_RUN_LOG_LIMIT, salesforceSyncHealth } = require('../dist/salesforce/salesforce-opportunities.service');
const { parseSpinergieCharters, parseSpinergieVessels } = require('../dist/salesforce/spinergie-vessel.transform');

test('Spinergie specs retain typed and nested fields keyed only by vesselId', () => {
  const fields = { vesselId: 123, vessel: 'Synthetic vessel', loa: 120.5, pipelay: false, linkSpecs: { label: 'Synthetic specification' }, daughterVesselIds: [456], nullable: null };
  assert.deepEqual(parseSpinergieVessels([fields]), [{ vesselId: '123', name: 'Synthetic vessel', fields }]);
});

test('Spinergie rejects empty, paginated, duplicate, malformed and invalid-ID extracts before writes', () => {
  for (const value of [[], {}, { results: [{ vesselId: 123 }] }, [null], [{ vesselId: '123' }], [{ vesselId: 0 }], [{ vesselId: 1.5 }], [{ vesselId: 123, loa: Infinity }], [{ vesselId: 123 }, { vesselId: 123 }]]) {
    assert.throws(() => parseSpinergieVessels(value), /Spinergie returned/);
  }
});

test('Spinergie preserves multiple charter snapshots for one vessel without inventing an upstream charter ID', () => {
  const first = { vesselId: 123, vesselTitle: 'Synthetic vessel', dateStart: 1000, dateEnd: 2000, dayRate: null, status: 'Synthetic status', nested: { second: 2, first: 1 } };
  const second = { ...first, dateStart: 3000, dateEnd: 4000 };
  const result = parseSpinergieCharters([first, second]);
  assert.equal(result.receivedCount, 2);
  assert.equal(result.records.length, 2);
  assert.notEqual(result.records[0].charterId, result.records[1].charterId);
  assert.deepEqual(result.records[0].fields, first);
  assert.equal(result.records[0].vesselId, '123');
  const reordered = { nested: { first: 1, second: 2 }, status: first.status, dayRate: null, dateEnd: 2000, dateStart: 1000, vesselTitle: first.vesselTitle, vesselId: 123 };
  assert.equal(parseSpinergieCharters([reordered]).records[0].charterId, result.records[0].charterId);
  assert.equal(parseSpinergieCharters([first, reordered]).records.length, 1);
  assert.notEqual(parseSpinergieCharters([{ ...first, status: 'Changed status' }]).records[0].charterId, result.records[0].charterId);
});

test('Spinergie charters reject incomplete and malformed extracts before storage', () => {
  for (const value of [[], { results: [] }, [null], [{ vesselId: '123' }], [{ vesselId: 0 }], [{ vesselId: 1.5 }], [{ vesselId: 123, duration: Infinity }]]) {
    assert.throws(() => parseSpinergieCharters(value), /Spinergie returned/);
  }
});

test('Spinergie blocks cross-tenant requests and analyst sync before database or core calls', async () => {
  const organisationId = randomUUID();
  const viewer = { id: randomUUID(), globalRoles: ['Capture-Pro Analyst'], organisations: [{ id: organisationId, membership: 'Member' }] };
  const service = new SalesforceOpportunitiesService({}, new ConfigService());
  const unrelatedId = randomUUID();
  await assert.rejects(service.listSpinergieVessels(unrelatedId, undefined, viewer, ''), /membership required/);
  await assert.rejects(service.spinergieSyncLog(unrelatedId, viewer, ''), /membership required/);
  await assert.rejects(service.syncSpinergieVessels(unrelatedId, viewer, ''), /membership required/);
  await assert.rejects(service.syncSpinergieVessels(organisationId, viewer, ''), /administrator access required/);
  await assert.rejects(service.listSpinergieCharters(unrelatedId, undefined, viewer, ''), /membership required/);
  await assert.rejects(service.spinergieCharterSyncLog(unrelatedId, viewer, ''), /membership required/);
  await assert.rejects(service.syncSpinergieCharters(unrelatedId, viewer, ''), /membership required/);
  await assert.rejects(service.syncSpinergieCharters(organisationId, viewer, ''), /administrator access required/);
});

const dialect = new PgDialect();
const orgId = randomUUID();
const otherOrgId = randomUUID();
const productId = randomUUID();
const userId = randomUUID();
const serviceKey = randomBytes(24).toString('hex');
const authorization = `Bearer ${randomBytes(24).toString('hex')}`;
const coreApiUrl = 'http://core.test/api';

function record(id, overrides = {}) {
  const value = Object.fromEntries(salesforceOpportunityFields.map((field) => [field, null]));
  return {
    ...value,
    Id: id,
    RecordTypeId: '0120e000000UPzPAAW',
    StageName: 'Early Identification',
    Opportunity_Number__c: `A${id.slice(-7, -3)}`,
    OpportunityName__c: `Opportunity ${id.slice(-7, -3)}`,
    priority__c: 'High',
    Exclude_from_Market_Analyst_Reports1__c: false,
    Proposal_Submitted__c: false,
    ITT_Received__c: false,
    Forecasted_Revenue__c: 1250000.5,
    Forecasted_Gross_Profit__c: 250000,
    Total_Contract_Value_for_all__c: 3000000,
    CloseDate: '2027-03-31',
    ...overrides,
  };
}

test('filters records exactly like the Power Query FilteredBusinessLine step', () => {
  assert.equal(matchesCaptureProExtract(record('006000000000001AAA')), true);
  assert.equal(matchesCaptureProExtract(record('006000000000001AAA', { RecordTypeId: 'other', Service_Agreement_Business_Line__c: 'Subsea & Floating Facilities' })), true);
  assert.equal(matchesCaptureProExtract(record('006000000000001AAA', { Opportunity_Number__c: 'q100' })), true);
  assert.equal(matchesCaptureProExtract(record('006000000000001AAA', { priority__c: '' })), true);
  for (const overrides of [
    { Exclude_from_Market_Analyst_Reports1__c: true },
    { Exclude_from_Market_Analyst_Reports1__c: null },
    { Opportunity_Number__c: 'Q100' },
    { Opportunity_Number__c: 'M100' },
    { Opportunity_Number__c: null },
    { priority__c: null },
    { RecordTypeId: 'other', Service_Agreement_Business_Line__c: null },
    { RecordTypeId: '0120e000000upzpaaw', Service_Agreement_Business_Line__c: 'subsea & floating facilities' },
  ]) {
    assert.equal(matchesCaptureProExtract(record('006000000000001AAA', overrides)), false, JSON.stringify(overrides));
  }
});

test('derives StageName using the Power Query rule order and case-sensitive comparisons', () => {
  const stage = (overrides) => deriveStageName(record('006000000000001AAA', overrides));
  assert.equal(stage({ StageName: 'Proposal', Winning_bidder__c: 'McDermott', Proposal_Submitted__c: true }), 'Closed Won');
  assert.equal(stage({ StageName: 'Negotiation', Winning_bidder__c: 'McDermott' }), 'Closed Won');
  assert.equal(stage({ StageName: 'Evaluation', Winning_bidder__c: 'Competitor' }), 'Closed Lost');
  assert.equal(stage({ StageName: 'Evaluation', Winning_bidder__c: 'mcdermott' }), 'Closed Lost');
  assert.equal(stage({ StageName: 'Negotiation', Winning_bidder__c: null, Proposal_Submitted__c: true }), 'Negotiation');
  assert.equal(stage({ StageName: 'Proposal', Proposal_Submitted__c: true }), 'Evaluation');
  assert.equal(stage({ StageName: 'Pre-RFP', Proposal_Submitted__c: true }), 'Evaluation');
  assert.equal(stage({ StageName: 'Pre - Qualification', Winning_bidder__c: 'McDermott', Proposal_Submitted__c: true }), 'Evaluation');
  assert.equal(stage({ StageName: 'Early Identification', ITT_Received__c: true, priority__c: 'High', Binding2__c: 'Yes' }), 'Proposal');
  assert.equal(stage({ StageName: 'Early Identification', ITT_Received__c: true, priority__c: 'Other', Binding2__c: 'Yes' }), 'Early Identification');
  assert.equal(stage({ StageName: 'Early Identification', ITT_Received__c: true, priority__c: 'High', Binding2__c: 'yes' }), 'Early Identification');
  assert.equal(stage({ StageName: 'Early Identification', ITT_Received__c: false, priority__c: 'High', Binding2__c: 'Yes' }), 'Early Identification');
  assert.equal(stage({ StageName: 'Early Identification', ITT_Received__c: 'true', priority__c: 'High', Binding2__c: 'Yes' }), 'Early Identification');
  assert.equal(stage({ StageName: 'Proposal', ITT_Received__c: true, priority__c: 'High', Binding2__c: 'Yes' }), 'Proposal');
  assert.equal(stage({ StageName: 'Closed Won', Winning_bidder__c: 'Competitor' }), 'Closed Won');
  assert.equal(stage({ StageName: null, Winning_bidder__c: 'McDermott' }), null);
});

test('replaces only null sub-categories with TBA and derives Floater or Subsea case-sensitively', () => {
  const transformed = (value) => transformSalesforceOpportunity(record('006000000000001AAA', { Sub_Category_Product_Type__c: value })).fields;
  assert.deepEqual([transformed(null).Sub_Category_Product_Type__c, transformed(null).ProductTypeSubCategory], ['TBA', 'Subsea']);
  assert.deepEqual([transformed('').Sub_Category_Product_Type__c, transformed('').ProductTypeSubCategory], ['', 'Subsea']);
  assert.equal(transformed('Floating Production').ProductTypeSubCategory, 'Floater');
  assert.equal(transformed('floating production').ProductTypeSubCategory, 'Subsea');
  assert.equal(transformed('SURF').ProductTypeSubCategory, 'Subsea');
  const result = transformSalesforceOpportunity(record('006000000000001AAA', { StageName: 'Proposal', Winning_bidder__c: 'McDermott' }));
  assert.equal(result.sourceStageName, 'Proposal');
  assert.equal(result.fields.StageName, 'Closed Won');
  assert.equal(Object.keys(result.fields).length, 50);
});

test('rejects malformed extract payloads from core', () => {
  for (const value of [null, {}, [null], [[]], [record('bad-id')], [record('006000000000001AAA', { Description: { nested: true } })], [record('006000000000001AAA', { Forecasted_Revenue__c: Number.NaN })]]) {
    assert.throws(() => parseSalesforceRecords(value));
  }
  const [parsed] = parseSalesforceRecords([{ ...record('006000000000001AAA'), Extra__c: 'dropped', attributes: {} }]);
  assert.equal(parsed.Extra__c, undefined);
  assert.equal(parsed.attributes, undefined);
});

let state;

const storeFor = (name) => {
  if (name === 'salesforce_opportunities') return state.opportunities;
  if (name === 'salesforce_accounts') return state.accounts;
  if (name === 'salesforce_competitors') return state.competitors;
  if (name === 'salesforce_bid_budgets') return state.bidBudgets;
  if (name === 'salesforce_fabrication_yards') return state.fabricationYards;
  if (name === 'salesforce_vessels') return state.vessels;
  if (name === 'salesforce_object_fields') return state.objectFields;
  throw new Error(`Unexpected record table ${name}`);
};

function fakeDb() {
  const sqlOf = (condition) => dialect.sqlToQuery(condition);
  const upsert = (name, value, config) => {
    const rows = Array.isArray(value) ? value : [value];
    const keyColumn = name === 'salesforce_object_fields' ? 'objectName' : 'salesforceId';
    assert.deepEqual(config.target.map((column) => column.name), ['org_id', name === 'salesforce_object_fields' ? 'object_name' : 'salesforce_id']);
    assert.equal(config.set.firstSyncedAt, undefined);
    assert.equal(config.set.id, undefined);
    if (state.failUpsert) throw new Error('database unavailable');
    const store = storeFor(name);
    return rows.map((row) => {
      const key = `${row.orgId}:${row[keyColumn]}`;
      const existing = store.get(key);
      if (existing) {
        store.set(key, { ...existing, ...row, id: existing.id, firstSyncedAt: existing.firstSyncedAt });
        return { inserted: false };
      }
      store.set(key, { ...row, id: randomUUID() });
      return { inserted: true };
    });
  };
  const thenable = (run) => ({ then: (resolve, reject) => Promise.resolve().then(run).then(resolve, reject) });
  const api = {
    execute: async (statement) => {
      const query = sqlOf(statement);
      assert.match(query.sql, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
      state.locks.push(query.params[0]);
    },
    insert: (table) => ({
      values: (value) => ({
        ...thenable(() => {
          const name = getTableName(table);
          if (name === 'salesforce_sync_runs') {
            assert.ok(['Opportunity', 'Account', 'Competitor', 'Bid Budget', 'Fabrication Yard', 'Vessel'].includes(value.objectType), 'every run records its object type');
            state.runs.push({ ...value });
          } else if (name === 'audit_events') state.audits.push({ ...value });
          else throw new Error(`Unexpected insert into ${name}`);
        }),
        onConflictDoUpdate: (config) => ({
          returning: async () => upsert(getTableName(table), value, config),
        }),
      }),
    }),
    update: (table) => ({
      set: (value) => ({
        where: (condition) => {
          const query = sqlOf(condition);
          const run = () => {
            const name = getTableName(table);
            if (name === 'salesforce_sync_runs') {
              assert.match(query.sql, /"salesforce_sync_runs"\."id" = \$1/);
              Object.assign(state.runs.find((candidate) => candidate.id === query.params[0]), value);
              return [];
            }
            const store = storeFor(name);
            assert.match(query.sql, new RegExp(`"${name}"\\."org_id" = \\$1 and "${name}"\\."in_extract" = \\$2 and "${name}"\\."last_sync_run_id" <> \\$3`));
            const [targetOrg, , runId] = query.params;
            const changed = [];
            for (const [key, row] of store) {
              if (row.orgId === targetOrg && row.inExtract && row.lastSyncRunId !== runId) {
                store.set(key, { ...row, ...value });
                changed.push({ id: row.id });
              }
            }
            return changed;
          };
          return { ...thenable(run), returning: async () => run() };
        },
      }),
    }),
    select: (selection) => ({
      from: (table) => ({
        leftJoin(joined, condition) {
          const join = sqlOf(condition).sql;
          assert.ok(join.includes(`."org_id" = "${getTableName(table)}"."org_id"`), 'linked records must be scoped to the same organisation');
          state.joins.push(getTableName(joined));
          return this;
        },
        where: (condition) => {
          const query = sqlOf(condition);
          const name = getTableName(table);
          const link = (row) => {
            if (!['salesforce_competitors', 'salesforce_bid_budgets'].includes(name)) return row;
            const opportunity = state.opportunities.get(`${row.orgId}:${row.opportunitySalesforceId}`);
            const account = state.accounts.get(`${row.orgId}:${row.competitorAccountId}`);
            return { ...row, opportunityNumber: opportunity?.opportunityNumber ?? null, opportunityName: opportunity?.opportunityName ?? null, competitorAccountName: account?.name ?? null };
          };
          const project = (row) => (selection ? Object.fromEntries(Object.keys(selection).map((key) => [key, link(row)[key] ?? null])) : row);
          const rows = () => {
            if (name === 'salesforce_sync_runs') {
              const objectType = query.params.find((param) => ['Opportunity', 'Account', 'Competitor', 'Bid Budget', 'Fabrication Yard', 'Vessel'].includes(param));
              if (objectType) assert.match(query.sql, /"salesforce_sync_runs"\."object_type" = \$2/);
              return state.runs.filter((run) => run.orgId === query.params[0] && (!objectType || (run.objectType ?? 'Opportunity') === objectType))
                .sort((a, b) => b.startedAt - a.startedAt)
                .map(project);
            }
            const includeRemoved = !query.sql.includes('in_extract');
            const sortKey = { salesforce_accounts: 'name', salesforce_competitors: 'competitorName', salesforce_bid_budgets: 'salesforceId', salesforce_fabrication_yards: 'name', salesforce_vessels: 'name', salesforce_object_fields: 'objectName' }[name] ?? 'opportunityNumber';
            return [...storeFor(name).values()]
              .filter((row) => row.orgId === query.params[0] && (includeRemoved || row.inExtract)
                && (name !== 'salesforce_object_fields' || row.objectName === query.params[1]))
              .sort((a, b) => String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? '')))
              .map(project);
          };
          return { orderBy: () => ({ ...thenable(rows), limit: async (count) => rows().slice(0, count) }) };
        },
      }),
    }),
    transaction: async (work) => {
      const snapshot = {
        runs: structuredClone(state.runs), audits: structuredClone(state.audits),
        opportunities: new Map(structuredClone([...state.opportunities])), accounts: new Map(structuredClone([...state.accounts])),
        competitors: new Map(structuredClone([...state.competitors])), bidBudgets: new Map(structuredClone([...state.bidBudgets])),
        fabricationYards: new Map(structuredClone([...state.fabricationYards])), objectFields: new Map(structuredClone([...state.objectFields])), vessels: new Map(structuredClone([...state.vessels])),
      };
      try {
        const result = await work(api);
        state.commits++;
        return result;
      } catch (error) {
        Object.assign(state, snapshot);
        state.rollbacks++;
        throw error;
      }
    },
  };
  return api;
}

const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const user = (overrides = {}) => ({
  id: userId, email: 'user@example.test', displayName: 'User', globalRoles: [],
  organisations: [{ id: orgId, membership: 'Member' }], ...overrides,
});
const admin = () => user({ globalRoles: ['Capture-Pro Module Administrator'] });

function service(config = { CORE_API_URL: coreApiUrl, CAPTUREPRO_INTERNAL_API_KEY: serviceKey }) {
  return new SalesforceOpportunitiesService(fakeDb(), new ConfigService(config));
}

async function withCore(handlers, run) {
  const calls = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url);
    calls.push({ url: target, init });
    if (target === `${coreApiUrl}/products?orgId=${orgId}`) return handlers.products();
    if (target === `${coreApiUrl}/organisations/${orgId}/modules/${productId}/integrations/capture-pro/salesforce/opportunities/extract`) return handlers.extract();
    throw new Error('Unexpected outbound request');
  });
  try {
    return await run(calls);
  } finally {
    fetchMock.mock.restore();
  }
}

const products = () => jsonResponse([{ id: randomUUID(), code: 'CreditGuard' }, { id: productId, code: 'Capture-Pro' }]);
const noExtract = () => { throw new Error('extract must not run'); };
const snapshot = () => JSON.stringify({ runs: state.runs, audits: state.audits, opportunities: [...state.opportunities], accounts: [...state.accounts] });

beforeEach(() => {
  state = { runs: [], audits: [], opportunities: new Map(), accounts: new Map(), competitors: new Map(), bidBudgets: new Map(), fabricationYards: new Map(), objectFields: new Map(), vessels: new Map(), joins: [], locks: [], commits: 0, rollbacks: 0, failUpsert: false };
});

test('administrators synchronize, transform, upsert, retain removed records, and record counts-only audit evidence', async () => {
  const previousRunId = randomUUID();
  const firstSyncedAt = new Date('2026-01-01T00:00:00.000Z');
  state.runs.push({ id: previousRunId, orgId, status: 'Succeeded', startedAt: firstSyncedAt });
  const stored = (salesforceId, overrides = {}) => ({
    id: randomUUID(), orgId, salesforceId, opportunityNumber: `A${salesforceId.slice(-7, -3)}`, inExtract: true,
    firstSyncedAt, lastSeenAt: firstSyncedAt, removedFromExtractAt: null, lastSyncRunId: previousRunId, ...overrides,
  });
  state.opportunities.set(`${orgId}:006000000000001AAA`, stored('006000000000001AAA'));
  state.opportunities.set(`${orgId}:006000000000009AAA`, stored('006000000000009AAA'));
  state.opportunities.set(`${orgId}:006000000000008AAA`, stored('006000000000008AAA', { inExtract: false, removedFromExtractAt: firstSyncedAt }));
  state.opportunities.set(`${otherOrgId}:006000000000007AAA`, { ...stored('006000000000007AAA'), orgId: otherOrgId });

  const records = [
    record('006000000000001AAA', { StageName: 'Proposal', Winning_bidder__c: 'McDermott' }),
    record('006000000000002AAA', { Sub_Category_Product_Type__c: 'Floating Production' }),
    record('006000000000008AAA'),
    record('006000000000003AAA', { Opportunity_Number__c: 'Q300' }),
    record('006000000000004AAA', { RecordTypeId: 'other' }),
  ];
  await withCore({ products, extract: () => jsonResponse({ fetchedAt: new Date().toISOString(), records }) }, async (calls) => {
    const result = await service().sync(orgId, admin(), authorization);
    assert.deepEqual(
      [result.receivedCount, result.matchedCount, result.insertedCount, result.updatedCount, result.removedCount],
      [5, 3, 1, 2, 1],
    );
    assert.equal(result.status, 'Succeeded');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].init.headers.Authorization, authorization);
    assert.equal(calls[1].init.method, 'POST');
    assert.equal(calls[1].init.redirect, 'error');
    assert.deepEqual(calls[1].init.headers, { Authorization: authorization, 'X-CapturePro-Service-Key': serviceKey });
    assert.deepEqual(state.locks, [`capturepro-salesforce-sync:${orgId}`]);
    assert.equal(state.commits, 1);

    const won = state.opportunities.get(`${orgId}:006000000000001AAA`);
    assert.equal(won.stageName, 'Closed Won');
    assert.equal(won.sourceStageName, 'Proposal');
    assert.equal(won.fields.StageName, 'Closed Won');
    assert.equal(won.subCategoryProductType, 'TBA');
    assert.equal(won.productTypeSubCategory, 'Subsea');
    assert.equal(won.forecastedRevenue, '1250000.5');
    assert.equal(won.closeDate, '2027-03-31');
    assert.equal(won.firstSyncedAt, firstSyncedAt);
    assert.equal(won.lastSyncRunId, result.id);
    assert.equal(state.opportunities.get(`${orgId}:006000000000002AAA`).productTypeSubCategory, 'Floater');
    const restored = state.opportunities.get(`${orgId}:006000000000008AAA`);
    assert.equal(restored.inExtract, true);
    assert.equal(restored.removedFromExtractAt, null);
    const removed = state.opportunities.get(`${orgId}:006000000000009AAA`);
    assert.equal(removed.inExtract, false);
    assert.ok(removed.removedFromExtractAt instanceof Date);
    assert.equal(state.opportunities.get(`${otherOrgId}:006000000000007AAA`).inExtract, true);
    assert.equal(state.opportunities.has(`${orgId}:006000000000003AAA`), false);
    assert.equal(state.opportunities.has(`${orgId}:006000000000004AAA`), false);

    const run = state.runs.find((candidate) => candidate.id === result.id);
    assert.equal(run.status, 'Succeeded');
    assert.equal(run.startedByUserId, userId);
    assert.equal(run.removedCount, 1);
    const [audit] = state.audits;
    assert.equal(audit.action, 'Salesforce opportunities synchronized');
    assert.deepEqual(Object.keys(audit.details).sort(), ['insertedCount', 'matchedCount', 'receivedCount', 'removedCount', 'runId', 'updatedCount']);
    assert.ok(!JSON.stringify(state.audits).includes('1250000'));
  });
});

test('repeating a sync is idempotent and does not mark current records removed', async () => {
  const records = [record('006000000000001AAA'), record('006000000000002AAA')];
  await withCore({ products, extract: () => jsonResponse({ records }) }, async () => {
    const first = await service().sync(orgId, admin(), authorization);
    const second = await service().sync(orgId, admin(), authorization);
    assert.deepEqual([first.insertedCount, first.updatedCount, first.removedCount], [2, 0, 0]);
    assert.deepEqual([second.insertedCount, second.updatedCount, second.removedCount], [0, 2, 0]);
    assert.equal(state.opportunities.size, 2);
    assert.ok([...state.opportunities.values()].every((row) => row.inExtract));
  });
});

test('managers, analysts, and ordinary members cannot start a sync', async () => {
  await withCore({ products, extract: noExtract }, async (calls) => {
    for (const candidate of [user(), user({ globalRoles: ['Capture-Pro Manager'] }), user({ globalRoles: ['Capture-Pro Analyst'] }), user({ globalRoles: ['Organisation Administrator'] })]) {
      await assert.rejects(service().sync(orgId, candidate, authorization), { status: 403 });
    }
    assert.equal(calls.length, 0);
  });
  assert.equal(state.runs.length, 0);
});

test('global administrators and organisation Owners/Admins can start a sync', async () => {
  await withCore({ products, extract: () => jsonResponse({ records: [] }) }, async () => {
    for (const candidate of [user({ globalRoles: ['Global Administrator'] }), user({ organisations: [{ id: orgId, membership: 'Owner' }] }), user({ organisations: [{ id: orgId, membership: 'Admin' }] })]) {
      assert.equal((await service().sync(orgId, candidate, authorization)).status, 'Succeeded');
    }
  });
});

test('rejects invalid or foreign organisations before calling core', async () => {
  await withCore({ products, extract: noExtract }, async (calls) => {
    await assert.rejects(service().sync('not-a-uuid', admin(), authorization), { status: 400 });
    await assert.rejects(service().sync(undefined, admin(), authorization), { status: 400 });
    await assert.rejects(service().sync(`${orgId}/../x`, admin(), authorization), { status: 400 });
    await assert.rejects(service().sync(otherOrgId, admin(), authorization), { status: 403 });
    await assert.rejects(service().list(otherOrgId, undefined, admin(), authorization), { status: 403 });
    assert.equal(calls.length, 0);
  });
  assert.equal(state.runs.length, 0);
});

test('uses the product identifier from core and stops when Capture-Pro is not available', async () => {
  for (const productsResponse of [
    () => jsonResponse([{ id: randomUUID(), code: 'CreditGuard' }]),
    () => jsonResponse([{ id: 'not-a-uuid', code: 'Capture-Pro' }]),
    () => jsonResponse({ message: 'User is not an active organisation member' }, 403),
  ]) {
    await withCore({ products: productsResponse, extract: noExtract }, async (calls) => {
      await assert.rejects(service().sync(orgId, admin(), authorization), { status: 403 });
      assert.equal(calls.length, 1);
    });
  }
  await withCore({ products: () => jsonResponse({}, 500), extract: noExtract }, async () => {
    await assert.rejects(service().sync(orgId, admin(), authorization), { status: 502 });
  });
  assert.equal(state.runs.length, 0);
});

test('records failed runs without changing opportunities when core or Salesforce fails', async () => {
  const existing = { id: randomUUID(), orgId, salesforceId: '006000000000001AAA', opportunityNumber: 'A0001', inExtract: true, lastSyncRunId: randomUUID() };
  state.opportunities.set(`${orgId}:006000000000001AAA`, existing);
  const scenarios = [
    [() => jsonResponse({ message: 'Salesforce integration is not configured' }, 409), 409, 'Salesforce integration is not configured'],
    [() => jsonResponse({ message: 'Salesforce rejected the token request (400)' }, 502), 502, 'Salesforce rejected the token request (400)'],
    [() => jsonResponse({ message: 'Capture-Pro service authentication required' }, 403), 403, 'Capture-Pro service authentication required'],
    [() => jsonResponse({ message: 'x'.repeat(400) }, 502), 502, 'Salesforce opportunities could not be retrieved'],
    [() => jsonResponse({ records: [record('006000000000002AAA', { Description: { nested: true } })] }), 502, 'Core returned an unsupported Salesforce field value'],
    [() => { throw new TypeError('connection refused'); }, 502, 'Salesforce opportunities could not be retrieved from core'],
  ];
  for (const [extract, status, message] of scenarios) {
    await withCore({ products, extract }, async () => {
      await assert.rejects(service().sync(orgId, admin(), authorization), { status, message });
    });
    const run = state.runs.at(-1);
    assert.equal(run.status, 'Failed');
    assert.equal(run.errorMessage, message);
    assert.equal(state.audits.at(-1).action, 'Salesforce opportunity sync failed');
    assert.deepEqual(Object.keys(state.audits.at(-1).details).sort(), ['runId', 'status']);
  }
  assert.deepEqual(state.opportunities.get(`${orgId}:006000000000001AAA`), existing);
  assert.equal(state.opportunities.size, 1);
});

test('does not record a run when the bearer token is rejected by core', async () => {
  await withCore({ products, extract: () => jsonResponse({ message: 'Invalid bearer token' }, 401) }, async () => {
    await assert.rejects(service().sync(orgId, admin(), authorization), { status: 401 });
  });
  assert.equal(state.runs.length, 0);
});

test('fails explicitly without calling core extract when the service key is not configured', async () => {
  await withCore({ products, extract: noExtract }, async (calls) => {
    await assert.rejects(service({ CORE_API_URL: coreApiUrl }).sync(orgId, admin(), authorization), { status: 502, message: 'Capture-Pro service authentication is not configured' });
    assert.equal(calls.length, 1);
  });
});

test('rolls back all opportunity changes when storage fails mid-sync', async () => {
  state.opportunities.set(`${orgId}:006000000000009AAA`, { id: randomUUID(), orgId, salesforceId: '006000000000009AAA', opportunityNumber: 'A0009', inExtract: true, lastSyncRunId: randomUUID() });
  state.failUpsert = true;
  const before = snapshot();
  await withCore({ products, extract: () => jsonResponse({ records: [record('006000000000001AAA')] }) }, async () => {
    await assert.rejects(service().sync(orgId, admin(), authorization), /database unavailable/);
  });
  assert.equal(snapshot(), before);
  assert.equal(state.rollbacks, 1);
});

test('viewers list current opportunities with all synced fields and can include removed records', async () => {
  await withCore({ products, extract: () => jsonResponse({ records: [record('006000000000001AAA'), record('006000000000002AAA')] }) }, async () => {
    await service().sync(orgId, admin(), authorization);
  });
  const removedKey = `${orgId}:006000000000002AAA`;
  state.opportunities.set(removedKey, { ...state.opportunities.get(removedKey), inExtract: false });
  state.opportunities.set(`${otherOrgId}:006000000000003AAA`, { ...state.opportunities.get(removedKey), orgId: otherOrgId, inExtract: true });
  await withCore({ products, extract: noExtract }, async () => {
    for (const viewer of [
      user({ globalRoles: ['Capture-Pro Manager'] }), user({ globalRoles: ['Capture-Pro Analyst'] }), admin(),
      user({ globalRoles: ['Global Administrator'] }), user({ organisations: [{ id: orgId, membership: 'Owner' }] }),
    ]) {
      const current = await service().list(orgId, undefined, viewer, authorization);
      assert.deepEqual(current.opportunities.map((row) => row.salesforceId), ['006000000000001AAA']);
      assert.equal(Object.keys(current.opportunities[0].fields).length, 50);
      assert.equal(current.opportunities[0].fields.ProductTypeSubCategory, 'Subsea');
      assert.equal(current.opportunities[0].fields.Forecasted_Revenue__c, 1250000.5);
      assert.equal(current.opportunities[0].orgId, undefined);
      assert.equal(current.opportunities[0].lastSyncRunId, undefined);
      assert.equal(current.lastSync.status, 'Succeeded');
      const all = await service().list(orgId, 'true', viewer, authorization);
      assert.deepEqual(all.opportunities.map((row) => row.salesforceId), ['006000000000001AAA', '006000000000002AAA']);
      const status = await service().syncStatus(orgId, viewer, authorization);
      assert.equal(status.lastSync.matchedCount, 2);
    }
  });
});

test('members without a Capture-Pro viewing role cannot list or read sync status', async () => {
  await withCore({ products, extract: noExtract }, async (calls) => {
    for (const candidate of [user(), user({ globalRoles: ['General User'] }), user({ globalRoles: ['CreditGuard Reviewer'] })]) {
      await assert.rejects(service().list(orgId, undefined, candidate, authorization), { status: 403 });
      await assert.rejects(service().syncStatus(orgId, candidate, authorization), { status: 403 });
    }
    assert.equal(calls.length, 0);
  });
  await withCore({ products: () => jsonResponse([]), extract: noExtract }, async () => {
    await assert.rejects(service().list(orgId, undefined, user({ globalRoles: ['Capture-Pro Analyst'] }), authorization), { status: 403 });
  });
});

const at = (minutes) => new Date(Date.UTC(2026, 9, 20, 0, minutes));
const run = (status, minutes, overrides = {}) => ({
  id: randomUUID(), orgId, objectType: 'Opportunity', status, startedByUserId: userId, startedAt: at(minutes), completedAt: at(minutes + 1),
  receivedCount: 10, matchedCount: 8, insertedCount: 1, updatedCount: 7, removedCount: 0, errorMessage: status === 'Failed' ? 'Salesforce rejected the token request (400)' : null,
  ...overrides,
});

test('derives connection health from recorded sync runs only', () => {
  assert.deepEqual(salesforceSyncHealth([]), {
    status: 'Not synchronized', lastRunAt: null, lastSuccessfulAt: null, lastFailedAt: null, consecutiveFailures: 0, recentRunCount: 0, recentSuccessCount: 0,
  });
  const healthy = salesforceSyncHealth([run('Succeeded', 30), run('Failed', 20), run('Succeeded', 10)]);
  assert.equal(healthy.status, 'Healthy');
  assert.equal(healthy.consecutiveFailures, 0);
  assert.deepEqual([healthy.lastSuccessfulAt, healthy.lastFailedAt], [at(31), at(21)]);
  assert.deepEqual([healthy.recentRunCount, healthy.recentSuccessCount], [3, 2]);
  const failing = salesforceSyncHealth([run('Failed', 40), run('Failed', 30), run('Succeeded', 10)]);
  assert.equal(failing.status, 'Failing');
  assert.equal(failing.consecutiveFailures, 2);
  assert.equal(failing.lastSuccessfulAt.getTime(), at(11).getTime());
  const neverSucceeded = salesforceSyncHealth([run('Failed', 20), run('Failed', 10)]);
  assert.equal(neverSucceeded.status, 'Failing');
  assert.equal(neverSucceeded.consecutiveFailures, 2);
  assert.equal(neverSucceeded.lastSuccessfulAt, null);
});

test('viewers read the newest sync runs with health, scoped to their organisation and without user identifiers', async () => {
  state.runs.push(run('Succeeded', 10), run('Failed', 20, { startedByUserId: randomUUID() }), run('Failed', 30));
  state.runs.push(run('Succeeded', 50, { orgId: otherOrgId }));
  for (let index = 0; index < SYNC_RUN_LOG_LIMIT + 5; index++) state.runs.push(run('Succeeded', -200 - index));
  await withCore({ products, extract: noExtract }, async () => {
    for (const viewer of [
      user({ globalRoles: ['Capture-Pro Manager'] }), user({ globalRoles: ['Capture-Pro Analyst'] }), admin(),
      user({ globalRoles: ['Global Administrator'] }), user({ organisations: [{ id: orgId, membership: 'Admin' }] }),
    ]) {
      const result = await service().syncRuns(orgId, viewer, authorization);
      assert.equal(result.runs.length, SYNC_RUN_LOG_LIMIT);
      assert.deepEqual(result.runs.slice(0, 3).map((entry) => entry.status), ['Failed', 'Failed', 'Succeeded']);
      assert.deepEqual(result.runs.slice(0, 2).map((entry) => entry.startedByCurrentUser), [true, false]);
      assert.equal(result.runs[0].errorMessage, 'Salesforce rejected the token request (400)');
      assert.ok(result.runs.every((entry) => entry.startedByUserId === undefined && entry.orgId === undefined));
      assert.equal(result.health.opportunities.status, 'Failing');
      assert.equal(result.health.accounts.status, 'Not synchronized');
      assert.ok(result.runs.every((entry) => entry.objectType === 'Opportunity'));
      assert.equal(result.health.opportunities.consecutiveFailures, 2);
      assert.equal(result.health.opportunities.lastSuccessfulAt.getTime(), at(11).getTime());
    }
  });
});

test('members without a Capture-Pro role, foreign organisations, and unassigned products cannot read the sync log', async () => {
  state.runs.push(run('Succeeded', 10));
  await withCore({ products, extract: noExtract }, async (calls) => {
    for (const candidate of [user(), user({ globalRoles: ['General User'] }), user({ globalRoles: ['CreditGuard Reviewer'] })]) {
      await assert.rejects(service().syncRuns(orgId, candidate, authorization), { status: 403 });
    }
    await assert.rejects(service().syncRuns(otherOrgId, admin(), authorization), { status: 403 });
    await assert.rejects(service().syncRuns('not-a-uuid', admin(), authorization), { status: 400 });
    assert.equal(calls.length, 0);
  });
  await withCore({ products: () => jsonResponse([]), extract: noExtract }, async () => {
    await assert.rejects(service().syncRuns(orgId, user({ globalRoles: ['Capture-Pro Analyst'] }), authorization), { status: 403 });
  });
});

const account = (id, overrides = {}) => ({ Id: id, Name: `Account ${id.slice(-7, -3)}`, Type: 'Customer', Company_Short_Name__c: `AC${id.slice(-7, -3)}`, ...overrides });
const accountExtractUrl = `${coreApiUrl}/organisations/${orgId}/modules/${productId}/integrations/capture-pro/salesforce/accounts/extract`;

async function withAccountCore(extract, run) {
  const calls = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url);
    calls.push({ url: target, init });
    if (target === `${coreApiUrl}/products?orgId=${orgId}`) return products();
    if (target === accountExtractUrl) return extract();
    throw new Error('Unexpected outbound request');
  });
  try {
    return await run(calls);
  } finally {
    fetchMock.mock.restore();
  }
}

test('administrators synchronize all accounts, retain removed ones, and record an Account run with counts-only audit', async () => {
  const previousRunId = randomUUID();
  const earlier = new Date('2026-01-01T00:00:00.000Z');
  state.runs.push({ id: previousRunId, orgId, objectType: 'Account', status: 'Succeeded', startedAt: earlier });
  const stored = (salesforceId, overrides = {}) => ({
    id: randomUUID(), orgId, salesforceId, name: 'Old name', type: 'Prospect', companyShortName: null, inExtract: true,
    firstSyncedAt: earlier, lastSeenAt: earlier, removedFromExtractAt: null, lastSyncRunId: previousRunId, ...overrides,
  });
  state.accounts.set(`${orgId}:001000000000001AAA`, stored('001000000000001AAA'));
  state.accounts.set(`${orgId}:001000000000009AAA`, stored('001000000000009AAA'));
  state.accounts.set(`${otherOrgId}:001000000000007AAA`, { ...stored('001000000000007AAA'), orgId: otherOrgId });
  state.opportunities.set(`${orgId}:006000000000001AAA`, { id: randomUUID(), orgId, salesforceId: '006000000000001AAA', opportunityNumber: 'A1', inExtract: true, lastSyncRunId: randomUUID() });
  const records = [
    account('001000000000001AAA', { Name: 'Petronas', Type: null }),
    account('001000000000002AAA', { Company_Short_Name__c: null }),
    account('001000000000002AAA', { Name: 'Duplicate keeps last' }),
  ];
  await withAccountCore(() => jsonResponse({ records }), async (calls) => {
    const result = await service().syncAccounts(orgId, admin(), authorization);
    assert.deepEqual(
      [result.objectType, result.receivedCount, result.matchedCount, result.insertedCount, result.updatedCount, result.removedCount],
      ['Account', 3, 2, 1, 1, 1],
    );
    assert.deepEqual(calls[1].init.headers, { Authorization: authorization, 'X-CapturePro-Service-Key': serviceKey });
    assert.equal(calls[1].url, accountExtractUrl);
    assert.deepEqual(state.locks, [`capturepro-salesforce-account-sync:${orgId}`]);
    const updated = state.accounts.get(`${orgId}:001000000000001AAA`);
    assert.deepEqual([updated.name, updated.type, updated.firstSyncedAt], ['Petronas', null, earlier]);
    assert.equal(state.accounts.get(`${orgId}:001000000000002AAA`).name, 'Duplicate keeps last');
    assert.equal(state.accounts.get(`${orgId}:001000000000002AAA`).companyShortName, 'AC0002');
    const removed = state.accounts.get(`${orgId}:001000000000009AAA`);
    assert.equal(removed.inExtract, false);
    assert.ok(removed.removedFromExtractAt instanceof Date);
    assert.equal(state.accounts.get(`${otherOrgId}:001000000000007AAA`).inExtract, true);
    assert.equal(state.opportunities.get(`${orgId}:006000000000001AAA`).inExtract, true, 'account sync never touches opportunities');
    const run = state.runs.find((candidate) => candidate.id === result.id);
    assert.deepEqual([run.objectType, run.status, run.removedCount], ['Account', 'Succeeded', 1]);
    assert.equal(state.audits[0].action, 'Salesforce accounts synchronized');
    assert.ok(!JSON.stringify(state.audits).includes('Petronas'));
  });
});

test('only integration administrators can sync accounts and failures record an Account run without changing data', async () => {
  await withAccountCore(noExtract, async (calls) => {
    for (const candidate of [user(), user({ globalRoles: ['Capture-Pro Manager'] }), user({ globalRoles: ['Capture-Pro Analyst'] })]) {
      await assert.rejects(service().syncAccounts(orgId, candidate, authorization), { status: 403 });
    }
    await assert.rejects(service().syncAccounts(otherOrgId, admin(), authorization), { status: 403 });
    assert.equal(calls.length, 0);
  });
  state.accounts.set(`${orgId}:001000000000001AAA`, { id: randomUUID(), orgId, salesforceId: '001000000000001AAA', name: 'Kept', inExtract: true, lastSyncRunId: randomUUID() });
  const before = JSON.stringify([...state.accounts]);
  for (const [extract, status, message] of [
    [() => jsonResponse({ message: 'Salesforce rejected the account query (400)' }, 502), 502, 'Salesforce rejected the account query (400)'],
    [() => jsonResponse({ message: 'Salesforce returned more than 50000 accounts' }, 502), 502, 'Salesforce returned more than 50000 accounts'],
    [() => jsonResponse({ records: [{ Id: '001000000000002AAA', Name: { nested: true } }] }), 502, 'Core returned an unsupported Salesforce account field value'],
  ]) {
    await withAccountCore(extract, async () => {
      await assert.rejects(service().syncAccounts(orgId, admin(), authorization), { status, message });
    });
    assert.deepEqual([state.runs.at(-1).objectType, state.runs.at(-1).status, state.runs.at(-1).errorMessage], ['Account', 'Failed', message]);
    assert.equal(state.audits.at(-1).action, 'Salesforce account sync failed');
  }
  assert.equal(JSON.stringify([...state.accounts]), before);
});

test('viewers list current accounts, can include removed ones, and see the latest Account run only', async () => {
  await withAccountCore(() => jsonResponse({ records: [account('001000000000001AAA', { Name: 'Beta' }), account('001000000000002AAA', { Name: 'Alpha' })] }), async () => {
    await service().syncAccounts(orgId, admin(), authorization);
  });
  state.runs.push({ id: randomUUID(), orgId, objectType: 'Opportunity', status: 'Failed', startedAt: new Date(Date.now() + 60_000), completedAt: new Date() });
  const removedKey = `${orgId}:001000000000002AAA`;
  state.accounts.set(removedKey, { ...state.accounts.get(removedKey), inExtract: false });
  state.accounts.set(`${otherOrgId}:001000000000003AAA`, { ...state.accounts.get(removedKey), orgId: otherOrgId, inExtract: true });
  await withAccountCore(noExtract, async () => {
    for (const viewer of [user({ globalRoles: ['Capture-Pro Manager'] }), user({ globalRoles: ['Capture-Pro Analyst'] }), admin()]) {
      const current = await service().listAccounts(orgId, undefined, viewer, authorization);
      assert.deepEqual(current.accounts.map((row) => row.name), ['Beta']);
      assert.deepEqual(Object.keys(current.accounts[0]).sort(), ['companyShortName', 'id', 'inExtract', 'lastSeenAt', 'name', 'removedFromExtractAt', 'salesforceId', 'type']);
      assert.equal(current.lastSync.objectType, 'Account');
      assert.equal(current.lastSync.status, 'Succeeded');
      const all = await service().listAccounts(orgId, 'true', viewer, authorization);
      assert.deepEqual(all.accounts.map((row) => row.name), ['Alpha', 'Beta']);
    }
    for (const candidate of [user(), user({ globalRoles: ['General User'] })]) {
      await assert.rejects(service().listAccounts(orgId, undefined, candidate, authorization), { status: 403 });
    }
    await assert.rejects(service().listAccounts(otherOrgId, undefined, admin(), authorization), { status: 403 });
  });
});

test('sync health and the run log distinguish Opportunity and Account runs', async () => {
  state.runs.push(
    { id: randomUUID(), orgId, objectType: 'Opportunity', status: 'Succeeded', startedByUserId: userId, startedAt: at(10), completedAt: at(11) },
    { id: randomUUID(), orgId, objectType: 'Account', status: 'Failed', startedByUserId: userId, startedAt: at(20), completedAt: at(21), errorMessage: 'Salesforce rejected the account query (400)' },
  );
  await withCore({ products, extract: noExtract }, async () => {
    const result = await service().syncRuns(orgId, user({ globalRoles: ['Capture-Pro Analyst'] }), authorization);
    assert.equal(result.health.opportunities.status, 'Healthy');
    assert.equal(result.health.accounts.status, 'Failing');
    assert.deepEqual(result.runs.map((entry) => entry.objectType), ['Account', 'Opportunity']);
    assert.equal(result.lastRuns.accounts.errorMessage, 'Salesforce rejected the account query (400)');
    assert.equal(result.lastRuns.opportunities.status, 'Succeeded');
    assert.equal(result.lastRuns.opportunities.startedByUserId, undefined);
    assert.equal(result.lastRuns.opportunities.startedByCurrentUser, true);
    const opportunityStatus = await service().syncStatus(orgId, user({ globalRoles: ['Capture-Pro Analyst'] }), authorization);
    assert.equal(opportunityStatus.lastSync.objectType, 'Opportunity');
  });
});

const competitorExtractUrl = `${coreApiUrl}/organisations/${orgId}/modules/${productId}/integrations/capture-pro/salesforce/competitors/extract`;
const competitor = (id, overrides = {}) => ({
  Id: id, Comments__c: 'Bid via JV', Competitor_Vessel__c: 'Seven Borealis', Competitor_Yard__c: null, Competitor__c: '001000000000001AAA',
  Won__c: false, Competitor_Name__c: `Competitor ${id.slice(-7, -3)}`, Competitor_s_Bid_Price__c: 125000000.5, Opportunity__c: '006000000000001AAA',
  ...overrides,
});

async function withCompetitorCore(extract, run) {
  const calls = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url);
    calls.push({ url: target, init });
    if (target === `${coreApiUrl}/products?orgId=${orgId}`) return products();
    if (target === competitorExtractUrl) return extract();
    throw new Error('Unexpected outbound request');
  });
  try {
    return await run(calls);
  } finally {
    fetchMock.mock.restore();
  }
}

test('administrators synchronize competitor records with native Salesforce types and retain removed records', async () => {
  const previousRunId = randomUUID();
  const earlier = new Date('2026-01-01T00:00:00.000Z');
  state.competitors.set(`${orgId}:a0B000000000009AAA`, {
    id: randomUUID(), orgId, salesforceId: 'a0B000000000009AAA', competitorName: 'Old', inExtract: true, firstSyncedAt: earlier, lastSyncRunId: previousRunId,
  });
  state.accounts.set(`${orgId}:001000000000001AAA`, { id: randomUUID(), orgId, salesforceId: '001000000000001AAA', name: 'Saipem', inExtract: true });
  const records = [
    competitor('a0B000000000001AAA', { Won__c: true, Competitor_Name__c: 'Saipem' }),
    competitor('a0B000000000002AAA', { Competitor__c: 'Not an Id', Opportunity__c: null, Competitor_s_Bid_Price__c: null }),
  ];
  await withCompetitorCore(() => jsonResponse({ records }), async (calls) => {
    const result = await service().syncCompetitors(orgId, admin(), authorization);
    assert.deepEqual(
      [result.objectType, result.receivedCount, result.matchedCount, result.insertedCount, result.updatedCount, result.removedCount],
      ['Competitor', 2, 2, 2, 0, 1],
    );
    assert.equal(calls[1].url, competitorExtractUrl);
    assert.deepEqual(state.locks, [`capturepro-salesforce-competitor-sync:${orgId}`]);
    const won = state.competitors.get(`${orgId}:a0B000000000001AAA`);
    assert.equal(won.fields.Won__c, true);
    assert.equal(won.fields.Competitor_s_Bid_Price__c, 125000000.5);
    assert.equal(won.bidPrice, '125000000.5');
    assert.deepEqual([won.competitorAccountId, won.opportunitySalesforceId], ['001000000000001AAA', '006000000000001AAA']);
    const other = state.competitors.get(`${orgId}:a0B000000000002AAA`);
    assert.deepEqual([other.competitorAccountId, other.opportunitySalesforceId, other.bidPrice, other.fields.Competitor__c], [null, null, null, 'Not an Id']);
    assert.equal(state.competitors.get(`${orgId}:a0B000000000009AAA`).inExtract, false);
    assert.equal(state.accounts.get(`${orgId}:001000000000001AAA`).inExtract, true, 'competitor sync never touches accounts');
    assert.equal(state.runs.find((run) => run.id === result.id).objectType, 'Competitor');
    assert.equal(state.audits[0].action, 'Salesforce competitors synchronized');
    assert.ok(!JSON.stringify(state.audits).includes('125000000'));
  });
});

test('only integration administrators can sync competitors and failures record a Competitor run', async () => {
  await withCompetitorCore(noExtract, async (calls) => {
    for (const candidate of [user(), user({ globalRoles: ['Capture-Pro Manager'] }), user({ globalRoles: ['Capture-Pro Analyst'] })]) {
      await assert.rejects(service().syncCompetitors(orgId, candidate, authorization), { status: 403 });
    }
    assert.equal(calls.length, 0);
  });
  await withCompetitorCore(() => jsonResponse({ message: 'Salesforce rejected the competitor query (400)' }, 502), async () => {
    await assert.rejects(service().syncCompetitors(orgId, admin(), authorization), { status: 502, message: 'Salesforce rejected the competitor query (400)' });
  });
  assert.deepEqual([state.runs.at(-1).objectType, state.runs.at(-1).status], ['Competitor', 'Failed']);
  assert.equal(state.audits.at(-1).action, 'Salesforce competitor sync failed');
  assert.equal(state.competitors.size, 0);
});

test('viewers list competitors with organisation-scoped linked opportunity and account names', async () => {
  await withCompetitorCore(() => jsonResponse({ records: [
    competitor('a0B000000000001AAA', { Competitor_Name__c: 'Saipem' }),
    competitor('a0B000000000002AAA', { Competitor_Name__c: 'Allseas', Competitor__c: '001000000000099AAA', Opportunity__c: '006000000000099AAA' }),
  ] }), async () => {
    await service().syncCompetitors(orgId, admin(), authorization);
  });
  state.opportunities.set(`${orgId}:006000000000001AAA`, { orgId, salesforceId: '006000000000001AAA', opportunityNumber: 'R3345', opportunityName: 'K5 Phase 2' });
  state.accounts.set(`${orgId}:001000000000001AAA`, { orgId, salesforceId: '001000000000001AAA', name: 'Saipem SpA' });
  state.opportunities.set(`${otherOrgId}:006000000000099AAA`, { orgId: otherOrgId, salesforceId: '006000000000099AAA', opportunityNumber: 'X1', opportunityName: 'Other tenant' });
  state.accounts.set(`${otherOrgId}:001000000000099AAA`, { orgId: otherOrgId, salesforceId: '001000000000099AAA', name: 'Other tenant account' });
  await withCompetitorCore(noExtract, async () => {
    for (const viewer of [user({ globalRoles: ['Capture-Pro Manager'] }), user({ globalRoles: ['Capture-Pro Analyst'] }), admin()]) {
      const result = await service().listCompetitors(orgId, undefined, viewer, authorization);
      assert.deepEqual(result.competitors.map((row) => row.fields.Competitor_Name__c), ['Allseas', 'Saipem']);
      const linked = result.competitors.find((row) => row.fields.Competitor_Name__c === 'Saipem');
      assert.deepEqual([linked.opportunityNumber, linked.opportunityName, linked.competitorAccountName], ['R3345', 'K5 Phase 2', 'Saipem SpA']);
      const unlinked = result.competitors.find((row) => row.fields.Competitor_Name__c === 'Allseas');
      assert.deepEqual([unlinked.opportunityNumber, unlinked.competitorAccountName], [null, null], 'other organisations never resolve names');
      assert.equal(result.lastSync.objectType, 'Competitor');
      assert.equal(result.competitors[0].orgId, undefined);
    }
    assert.ok(state.joins.includes('linked_opportunity') && state.joins.includes('linked_account'));
    for (const candidate of [user(), user({ globalRoles: ['General User'] })]) {
      await assert.rejects(service().listCompetitors(orgId, undefined, candidate, authorization), { status: 403 });
    }
    await assert.rejects(service().listCompetitors(otherOrgId, undefined, admin(), authorization), { status: 403 });
  });
});

test('sync health and last runs include competitors', async () => {
  state.runs.push({ id: randomUUID(), orgId, objectType: 'Competitor', status: 'Succeeded', startedByUserId: userId, startedAt: at(30), completedAt: at(31) });
  await withCore({ products, extract: noExtract }, async () => {
    const result = await service().syncRuns(orgId, user({ globalRoles: ['Capture-Pro Analyst'] }), authorization);
    assert.equal(result.health.competitors.status, 'Healthy');
    assert.equal(result.health.accounts.status, 'Not synchronized');
    assert.equal(result.lastRuns.competitors.objectType, 'Competitor');
    assert.equal(result.lastRuns.competitors.startedByUserId, undefined);
  });
});

const bidBudgetExtractUrl = `${coreApiUrl}/organisations/${orgId}/modules/${productId}/integrations/capture-pro/salesforce/bid-budgets/extract`;
const bidBudget = (id, overrides = {}) => ({
  Id: id, Opportunity__c: '006000000000001AAA', Actual_Bid_Cost__c: 1250000.25, Compensation__c: null,
  Opportunity_Bid_Budget_Recovery_Year__c: '2026', Budgeted_Hours__c: 8200, Forecasted_Spend__c: 1400000, Actual_Bid_Budget__c: 1500000,
  Additional_Pre_Contract_1__c: 0, Additional_Pre_Contract_2__c: null, Additional_Pre_Contract_3__c: null, Forecast_Purpose__c: 'FEED',
  PG1_Pre_Contract__c: true, ...overrides,
});

async function withBidBudgetCore(extract, run) {
  const calls = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url);
    calls.push({ url: target, init });
    if (target === `${coreApiUrl}/products?orgId=${orgId}`) return products();
    if (target === bidBudgetExtractUrl) return extract();
    throw new Error('Unexpected outbound request');
  });
  try {
    return await run(calls);
  } finally {
    fetchMock.mock.restore();
  }
}

test('administrators synchronize bid budget records keyed by Id with native Salesforce types and retain removed records', async () => {
  const previousRunId = randomUUID();
  const earlier = new Date('2026-01-01T00:00:00.000Z');
  state.bidBudgets.set(`${orgId}:a0C000000000009AAA`, {
    id: randomUUID(), orgId, salesforceId: 'a0C000000000009AAA', inExtract: true, firstSyncedAt: earlier, lastSyncRunId: previousRunId,
  });
  state.competitors.set(`${orgId}:a0B000000000001AAA`, { id: randomUUID(), orgId, salesforceId: 'a0B000000000001AAA', inExtract: true, lastSyncRunId: previousRunId });
  const records = [
    bidBudget('a0C000000000001AAA'),
    bidBudget('a0C000000000002AAA', { Forecast_Purpose__c: 'Tender', Actual_Bid_Cost__c: 99 }),
    bidBudget('a0C000000000003AAA', { Opportunity__c: 'Not an Id', PG1_Pre_Contract__c: false }),
    bidBudget('a0C000000000001AAA', { Actual_Bid_Cost__c: 2000000 }),
  ];
  await withBidBudgetCore(() => jsonResponse({ records }), async (calls) => {
    const result = await service().syncBidBudgets(orgId, admin(), authorization);
    assert.deepEqual(
      [result.objectType, result.receivedCount, result.matchedCount, result.insertedCount, result.updatedCount, result.removedCount],
      ['Bid Budget', 4, 3, 3, 0, 1],
    );
    assert.equal(calls[1].url, bidBudgetExtractUrl);
    assert.deepEqual(state.locks, [`capturepro-salesforce-bid-budget-sync:${orgId}`]);
    const first = state.bidBudgets.get(`${orgId}:a0C000000000001AAA`);
    assert.equal(first.fields.Actual_Bid_Cost__c, 2000000, 'the last duplicate Id wins');
    assert.equal(first.fields.PG1_Pre_Contract__c, true);
    assert.equal(first.fields.Budgeted_Hours__c, 8200);
    assert.equal(first.opportunitySalesforceId, '006000000000001AAA');
    const second = state.bidBudgets.get(`${orgId}:a0C000000000002AAA`);
    assert.equal(second.opportunitySalesforceId, '006000000000001AAA', 'several budgets can share an opportunity');
    const third = state.bidBudgets.get(`${orgId}:a0C000000000003AAA`);
    assert.deepEqual([third.opportunitySalesforceId, third.fields.Opportunity__c], [null, 'Not an Id']);
    assert.equal(state.bidBudgets.get(`${orgId}:a0C000000000009AAA`).inExtract, false);
    assert.equal(state.competitors.get(`${orgId}:a0B000000000001AAA`).inExtract, true, 'bid budget sync never touches competitors');
    assert.equal(state.runs.find((run) => run.id === result.id).objectType, 'Bid Budget');
    assert.equal(state.audits[0].action, 'Salesforce bid budgets synchronized');
    assert.ok(!JSON.stringify(state.audits).includes('2000000') && !JSON.stringify(state.audits).includes('1250000'));
  });
  await withBidBudgetCore(() => jsonResponse({ records: [bidBudget('a0C000000000001AAA')] }), async () => {
    const repeat = await service().syncBidBudgets(orgId, admin(), authorization);
    assert.deepEqual([repeat.insertedCount, repeat.updatedCount, repeat.removedCount], [0, 1, 2]);
    assert.equal(state.bidBudgets.get(`${orgId}:a0C000000000001AAA`).fields.Actual_Bid_Cost__c, 1250000.25);
  });
});

test('only integration administrators can sync bid budgets and failures record a Bid Budget run without changing data', async () => {
  await withBidBudgetCore(noExtract, async (calls) => {
    for (const candidate of [user(), user({ globalRoles: ['Capture-Pro Manager'] }), user({ globalRoles: ['Capture-Pro Analyst'] })]) {
      await assert.rejects(service().syncBidBudgets(orgId, candidate, authorization), { status: 403 });
    }
    await assert.rejects(service().syncBidBudgets(otherOrgId, admin(), authorization), { status: 403 });
    assert.equal(calls.length, 0);
  });
  await withBidBudgetCore(() => jsonResponse({ message: 'Salesforce rejected the bid budget query (400)' }, 502), async () => {
    await assert.rejects(service().syncBidBudgets(orgId, admin(), authorization), { status: 502, message: 'Salesforce rejected the bid budget query (400)' });
  });
  assert.deepEqual([state.runs.at(-1).objectType, state.runs.at(-1).status], ['Bid Budget', 'Failed']);
  assert.equal(state.audits.at(-1).action, 'Salesforce bid budget sync failed');
  await withBidBudgetCore(() => jsonResponse({ records: [bidBudget('a0C000000000001AAA', { Actual_Bid_Cost__c: { amount: 1 } })] }), async () => {
    await assert.rejects(service().syncBidBudgets(orgId, admin(), authorization), { status: 502 });
  });
  assert.equal(state.bidBudgets.size, 0);
});

test('viewers list bid budgets with organisation-scoped linked opportunity names', async () => {
  await withBidBudgetCore(() => jsonResponse({ records: [
    bidBudget('a0C000000000001AAA'),
    bidBudget('a0C000000000002AAA', { Opportunity__c: '006000000000099AAA' }),
  ] }), async () => {
    await service().syncBidBudgets(orgId, admin(), authorization);
  });
  state.opportunities.set(`${orgId}:006000000000001AAA`, { orgId, salesforceId: '006000000000001AAA', opportunityNumber: 'R3345', opportunityName: 'K5 Phase 2' });
  state.opportunities.set(`${otherOrgId}:006000000000099AAA`, { orgId: otherOrgId, salesforceId: '006000000000099AAA', opportunityNumber: 'X1', opportunityName: 'Other tenant' });
  await withBidBudgetCore(noExtract, async () => {
    for (const viewer of [user({ globalRoles: ['Capture-Pro Manager'] }), user({ globalRoles: ['Capture-Pro Analyst'] }), admin()]) {
      const result = await service().listBidBudgets(orgId, undefined, viewer, authorization);
      assert.deepEqual(result.bidBudgets.map((row) => row.salesforceId), ['a0C000000000001AAA', 'a0C000000000002AAA']);
      assert.deepEqual([result.bidBudgets[0].opportunityNumber, result.bidBudgets[0].opportunityName], ['R3345', 'K5 Phase 2']);
      assert.equal(result.bidBudgets[0].fields.Actual_Bid_Cost__c, 1250000.25);
      assert.deepEqual([result.bidBudgets[1].opportunityNumber, result.bidBudgets[1].opportunityName], [null, null], 'other organisations never resolve names');
      assert.equal(result.lastSync.objectType, 'Bid Budget');
      assert.equal(result.bidBudgets[0].orgId, undefined);
    }
    assert.ok(state.joins.includes('linked_opportunity'));
    for (const candidate of [user(), user({ globalRoles: ['General User'] })]) {
      await assert.rejects(service().listBidBudgets(orgId, undefined, candidate, authorization), { status: 403 });
    }
    await assert.rejects(service().listBidBudgets(otherOrgId, undefined, admin(), authorization), { status: 403 });
  });
});

test('sync health and last runs include bid budgets', async () => {
  state.runs.push({ id: randomUUID(), orgId, objectType: 'Bid Budget', status: 'Failed', startedByUserId: userId, startedAt: at(40), completedAt: at(41) });
  await withCore({ products, extract: noExtract }, async () => {
    const result = await service().syncRuns(orgId, user({ globalRoles: ['Capture-Pro Analyst'] }), authorization);
    assert.equal(result.health.bidBudgets.status, 'Failing');
    assert.equal(result.health.competitors.status, 'Not synchronized');
    assert.equal(result.lastRuns.bidBudgets.objectType, 'Bid Budget');
    assert.equal(result.lastRuns.bidBudgets.startedByUserId, undefined);
  });
});

const fabricationYardExtractUrl = `${coreApiUrl}/organisations/${orgId}/modules/${productId}/integrations/capture-pro/salesforce/fabrication-yards/extract`;
const yardFields = [
  { name: 'Id', label: 'Record ID', type: 'id' },
  { name: 'Name', label: 'Fabrication Yard Name', type: 'string' },
  { name: 'Country__c', label: 'Country', type: 'picklist' },
  { name: 'Capacity_Tonnes__c', label: 'Capacity (t)', type: 'double' },
  { name: 'Active__c', label: 'Active', type: 'boolean' },
];
const yard = (id, overrides = {}) => ({ Id: id, Name: `Yard ${id.slice(-7, -3)}`, Country__c: 'Indonesia', Capacity_Tonnes__c: 45000.5, Active__c: true, ...overrides });

async function withFabricationYardCore(extract, run) {
  const calls = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url);
    calls.push({ url: target, init });
    if (target === `${coreApiUrl}/products?orgId=${orgId}`) return products();
    if (target === fabricationYardExtractUrl) return extract();
    throw new Error('Unexpected outbound request');
  });
  try {
    return await run(calls);
  } finally {
    fetchMock.mock.restore();
  }
}

test('administrators synchronize described fabrication yard fields and records and retain removed records', async () => {
  const previousRunId = randomUUID();
  const earlier = new Date('2026-01-01T00:00:00.000Z');
  state.fabricationYards.set(`${orgId}:a0D000000000009AAA`, {
    id: randomUUID(), orgId, salesforceId: 'a0D000000000009AAA', name: 'Closed Yard', inExtract: true, firstSyncedAt: earlier, lastSyncRunId: previousRunId,
  });
  state.bidBudgets.set(`${orgId}:a0C000000000001AAA`, { id: randomUUID(), orgId, salesforceId: 'a0C000000000001AAA', inExtract: true, lastSyncRunId: previousRunId });
  const records = [
    yard('a0D000000000001AAA', { Name: 'Batam Yard', Unrequested__c: 'dropped' }),
    yard('a0D000000000002AAA', { Name: 'Jebel Ali Yard', Country__c: 'UAE', Active__c: false, Capacity_Tonnes__c: null }),
  ];
  await withFabricationYardCore(() => jsonResponse({ fields: yardFields, records }), async (calls) => {
    const result = await service().syncFabricationYards(orgId, admin(), authorization);
    assert.deepEqual(
      [result.objectType, result.receivedCount, result.matchedCount, result.insertedCount, result.updatedCount, result.removedCount],
      ['Fabrication Yard', 2, 2, 2, 0, 1],
    );
    assert.equal(calls[1].url, fabricationYardExtractUrl);
    assert.deepEqual(state.locks, [`capturepro-salesforce-fabrication-yard-sync:${orgId}`]);
    const batam = state.fabricationYards.get(`${orgId}:a0D000000000001AAA`);
    assert.equal(batam.name, 'Batam Yard');
    assert.deepEqual(Object.keys(batam.fields).sort(), ['Active__c', 'Capacity_Tonnes__c', 'Country__c', 'Id', 'Name']);
    assert.equal(batam.fields.Capacity_Tonnes__c, 45000.5);
    assert.equal(state.fabricationYards.get(`${orgId}:a0D000000000002AAA`).fields.Active__c, false);
    assert.equal(state.fabricationYards.get(`${orgId}:a0D000000000009AAA`).inExtract, false);
    assert.deepEqual(state.objectFields.get(`${orgId}:Fabrication_Yard__c`).fields, yardFields);
    assert.equal(state.bidBudgets.get(`${orgId}:a0C000000000001AAA`).inExtract, true, 'fabrication yard sync never touches bid budgets');
    assert.equal(state.audits[0].action, 'Salesforce fabrication yards synchronized');
    assert.equal(state.audits[0].details.fieldCount, 5);
    assert.ok(!JSON.stringify(state.audits).includes('Batam'));
  });
  const changedFields = [...yardFields.slice(0, 2), { name: 'Region__c', label: 'Region', type: 'picklist' }];
  await withFabricationYardCore(() => jsonResponse({ fields: changedFields, records: [{ Id: 'a0D000000000001AAA', Name: 'Batam Yard', Region__c: 'Asia' }] }), async () => {
    const repeat = await service().syncFabricationYards(orgId, admin(), authorization);
    assert.deepEqual([repeat.insertedCount, repeat.updatedCount, repeat.removedCount], [0, 1, 1]);
    assert.deepEqual(state.objectFields.get(`${orgId}:Fabrication_Yard__c`).fields, changedFields, 'field definitions follow the latest describe');
    assert.equal(state.objectFields.size, 1);
    assert.deepEqual(state.fabricationYards.get(`${orgId}:a0D000000000001AAA`).fields, { Id: 'a0D000000000001AAA', Name: 'Batam Yard', Region__c: 'Asia' });
  });
});

test('only integration administrators can sync fabrication yards and invalid extracts record a failed run without changing data', async () => {
  await withFabricationYardCore(noExtract, async (calls) => {
    for (const candidate of [user(), user({ globalRoles: ['Capture-Pro Manager'] }), user({ globalRoles: ['Capture-Pro Analyst'] })]) {
      await assert.rejects(service().syncFabricationYards(orgId, candidate, authorization), { status: 403 });
    }
    await assert.rejects(service().syncFabricationYards(otherOrgId, admin(), authorization), { status: 403 });
    assert.equal(calls.length, 0);
  });
  for (const body of [
    { records: [yard('a0D000000000001AAA')] },
    { fields: [{ name: 'Name', label: 'Name', type: 'string' }], records: [] },
    { fields: [...yardFields, { name: 'Bad Name', label: 'Bad', type: 'string' }], records: [] },
    { fields: [...yardFields, { name: 'Name', label: 'Duplicate', type: 'string' }], records: [] },
    { fields: yardFields, records: [yard('a0D000000000001AAA', { Country__c: { nested: true } })] },
  ]) {
    await withFabricationYardCore(() => jsonResponse(body), async () => {
      await assert.rejects(service().syncFabricationYards(orgId, admin(), authorization), { status: 502 });
    });
  }
  await withFabricationYardCore(() => jsonResponse({ message: 'Salesforce rejected the fabrication yard describe request (404)' }, 502), async () => {
    await assert.rejects(service().syncFabricationYards(orgId, admin(), authorization), { status: 502, message: 'Salesforce rejected the fabrication yard describe request (404)' });
  });
  assert.ok(state.runs.every((run) => run.objectType === 'Fabrication Yard' && run.status === 'Failed'));
  assert.equal(state.runs.length, 6);
  assert.equal(state.audits.at(-1).action, 'Salesforce fabrication yard sync failed');
  assert.equal(state.fabricationYards.size, 0);
  assert.equal(state.objectFields.size, 0);
});

test('viewers list fabrication yards with organisation-scoped field definitions', async () => {
  await withFabricationYardCore(() => jsonResponse({ fields: yardFields, records: [yard('a0D000000000002AAA', { Name: 'Jebel Ali Yard' }), yard('a0D000000000001AAA', { Name: 'Batam Yard' })] }), async () => {
    await service().syncFabricationYards(orgId, admin(), authorization);
  });
  state.objectFields.set(`${otherOrgId}:Fabrication_Yard__c`, { orgId: otherOrgId, objectName: 'Fabrication_Yard__c', fields: [{ name: 'Secret__c', label: 'Other tenant', type: 'string' }] });
  state.fabricationYards.set(`${otherOrgId}:a0D000000000003AAA`, { orgId: otherOrgId, salesforceId: 'a0D000000000003AAA', name: 'Other tenant yard', fields: {}, inExtract: true });
  await withFabricationYardCore(noExtract, async () => {
    for (const viewer of [user({ globalRoles: ['Capture-Pro Manager'] }), user({ globalRoles: ['Capture-Pro Analyst'] }), admin()]) {
      const result = await service().listFabricationYards(orgId, undefined, viewer, authorization);
      assert.deepEqual(result.fabricationYards.map((row) => row.name), ['Batam Yard', 'Jebel Ali Yard']);
      assert.deepEqual(result.fieldDefinitions, yardFields);
      assert.equal(result.lastSync.objectType, 'Fabrication Yard');
      assert.equal(result.fabricationYards[0].orgId, undefined);
    }
    for (const candidate of [user(), user({ globalRoles: ['General User'] })]) {
      await assert.rejects(service().listFabricationYards(orgId, undefined, candidate, authorization), { status: 403 });
    }
    await assert.rejects(service().listFabricationYards(otherOrgId, undefined, admin(), authorization), { status: 403 });
  });
});

test('fabrication yard lists are empty with no field definitions before the first sync, and health includes them', async () => {
  await withFabricationYardCore(noExtract, async () => {
    const result = await service().listFabricationYards(orgId, undefined, admin(), authorization);
    assert.deepEqual([result.lastSync, result.fieldDefinitions, result.fabricationYards], [null, [], []]);
  });
  state.runs.push({ id: randomUUID(), orgId, objectType: 'Fabrication Yard', status: 'Succeeded', startedByUserId: userId, startedAt: at(50), completedAt: at(51) });
  await withCore({ products, extract: noExtract }, async () => {
    const result = await service().syncRuns(orgId, user({ globalRoles: ['Capture-Pro Analyst'] }), authorization);
    assert.equal(result.health.fabricationYards.status, 'Healthy');
    assert.equal(result.lastRuns.fabricationYards.objectType, 'Fabrication Yard');
    assert.equal(result.lastRuns.fabricationYards.startedByUserId, undefined);
  });
});

const vesselExtractUrl = `${coreApiUrl}/organisations/${orgId}/modules/${productId}/integrations/capture-pro/salesforce/vessels/extract`;
const vesselFields = [
  { name: 'Id', label: 'Record ID', type: 'id' },
  { name: 'Name', label: 'Vessel Name', type: 'string' },
  { name: 'Crane_Capacity__c', label: 'Crane Capacity', type: 'double' },
  { name: 'DP_Class__c', label: 'DP Class', type: 'picklist' },
];

async function withVesselCore(extract, run) {
  const calls = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url, init) => {
    const target = String(url);
    calls.push({ url: target, init });
    if (target === `${coreApiUrl}/products?orgId=${orgId}`) return products();
    if (target === vesselExtractUrl) return extract();
    throw new Error('Unexpected outbound request');
  });
  try {
    return await run(calls);
  } finally {
    fetchMock.mock.restore();
  }
}

test('administrators synchronize vessels with discovered fields kept separate from fabrication yards', async () => {
  const previousRunId = randomUUID();
  state.objectFields.set(`${orgId}:Fabrication_Yard__c`, { orgId, objectName: 'Fabrication_Yard__c', fields: yardFields, lastSyncRunId: previousRunId });
  state.fabricationYards.set(`${orgId}:a0D000000000001AAA`, { id: randomUUID(), orgId, salesforceId: 'a0D000000000001AAA', name: 'Batam Yard', fields: {}, inExtract: true, lastSyncRunId: previousRunId });
  state.vessels.set(`${orgId}:a0E000000000009AAA`, { id: randomUUID(), orgId, salesforceId: 'a0E000000000009AAA', name: 'Retired Barge', fields: {}, inExtract: true, lastSyncRunId: previousRunId });
  const records = [
    { Id: 'a0E000000000001AAA', Name: 'DLV 2000', Crane_Capacity__c: 2200, DP_Class__c: 'DP3' },
    { Id: 'a0E000000000002AAA', Name: 'Derrick Barge 50', Crane_Capacity__c: 4400, DP_Class__c: null },
  ];
  await withVesselCore(() => jsonResponse({ fields: vesselFields, records }), async (calls) => {
    const result = await service().syncVessels(orgId, admin(), authorization);
    assert.deepEqual(
      [result.objectType, result.receivedCount, result.matchedCount, result.insertedCount, result.updatedCount, result.removedCount],
      ['Vessel', 2, 2, 2, 0, 1],
    );
    assert.equal(calls[1].url, vesselExtractUrl);
    assert.deepEqual(state.locks, [`capturepro-salesforce-vessel-sync:${orgId}`]);
    assert.equal(state.vessels.get(`${orgId}:a0E000000000001AAA`).fields.Crane_Capacity__c, 2200);
    assert.equal(state.vessels.get(`${orgId}:a0E000000000009AAA`).inExtract, false);
    assert.deepEqual(state.objectFields.get(`${orgId}:Vessel__c`).fields, vesselFields);
    assert.deepEqual(state.objectFields.get(`${orgId}:Fabrication_Yard__c`).fields, yardFields, 'vessel sync never changes fabrication yard fields');
    assert.equal(state.fabricationYards.get(`${orgId}:a0D000000000001AAA`).inExtract, true, 'vessel sync never touches fabrication yards');
    assert.equal(state.audits[0].action, 'Salesforce vessels synchronized');
    assert.ok(!JSON.stringify(state.audits).includes('DLV'));
  });
  await withVesselCore(noExtract, async () => {
    for (const viewer of [user({ globalRoles: ['Capture-Pro Analyst'] }), admin()]) {
      const result = await service().listVessels(orgId, undefined, viewer, authorization);
      assert.deepEqual(result.vessels.map((row) => row.name), ['Derrick Barge 50', 'DLV 2000']);
      assert.deepEqual(result.fieldDefinitions, vesselFields);
      assert.equal(result.objectName, 'Vessel__c');
      assert.equal(result.lastSync.objectType, 'Vessel');
      assert.equal(result.vessels[0].orgId, undefined);
    }
    const withRemoved = await service().listVessels(orgId, 'true', admin(), authorization);
    assert.equal(withRemoved.vessels.length, 3);
    const yards = await service().listFabricationYards(orgId, undefined, admin(), authorization);
    assert.deepEqual([yards.objectName, yards.fieldDefinitions, yards.fabricationYards.length], ['Fabrication_Yard__c', yardFields, 1]);
  });
});

test('only integration administrators can sync vessels, viewers need a Capture-Pro role, and failures record a Vessel run', async () => {
  await withVesselCore(noExtract, async (calls) => {
    for (const candidate of [user(), user({ globalRoles: ['Capture-Pro Manager'] }), user({ globalRoles: ['Capture-Pro Analyst'] })]) {
      await assert.rejects(service().syncVessels(orgId, candidate, authorization), { status: 403 });
    }
    for (const candidate of [user(), user({ globalRoles: ['General User'] })]) {
      await assert.rejects(service().listVessels(orgId, undefined, candidate, authorization), { status: 403, message: 'A Capture-Pro role is required to view Salesforce vessels' });
    }
    await assert.rejects(service().listVessels(otherOrgId, undefined, admin(), authorization), { status: 403 });
    assert.equal(calls.length, 0);
  });
  await withVesselCore(() => jsonResponse({ fields: [{ name: 'Name', label: 'Name', type: 'string' }], records: [] }), async () => {
    await assert.rejects(service().syncVessels(orgId, admin(), authorization), { status: 502 });
  });
  assert.deepEqual([state.runs.at(-1).objectType, state.runs.at(-1).status], ['Vessel', 'Failed']);
  assert.equal(state.audits.at(-1).action, 'Salesforce vessel sync failed');
  assert.equal(state.vessels.size, 0);
  assert.equal(state.objectFields.size, 0);
  state.runs.push({ id: randomUUID(), orgId, objectType: 'Vessel', status: 'Succeeded', startedByUserId: userId, startedAt: new Date(Date.now() + 60_000), completedAt: new Date(Date.now() + 61_000) });
  await withCore({ products, extract: noExtract }, async () => {
    const result = await service().syncRuns(orgId, user({ globalRoles: ['Capture-Pro Analyst'] }), authorization);
    assert.equal(result.health.vessels.status, 'Healthy');
    assert.equal(result.health.fabricationYards.status, 'Not synchronized');
    assert.equal(result.lastRuns.vessels.objectType, 'Vessel');
  });
});
