const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { getTableName } = require('drizzle-orm');
const { PgDialect } = require('drizzle-orm/pg-core');
const {
  assertLocalCoreDatabase, captureProAdministratorRoleDefinition, captureProIntegrationRoute, captureProSalesforceOpportunitiesRoute, captureProOpportunityWorkspaceRoute,
  captureProSalesforceSyncRoute, captureProSalesforceAccountsRoute, captureProSalesforceCompetitorsRoute, captureProSalesforceBidBudgetsRoute, captureProSalesforceFabricationYardsRoute, captureProSalesforceVesselsRoute, legacyCaptureProSalesforceOpportunitiesRoute, registerCaptureProIntegrationMenu, registerCaptureProSalesforceMenus,
} = require('../dist/db/capture-pro-integration-menu');

function fixture() {
  const product = { id: randomUUID(), code: 'Capture-Pro' };
  const parent = { id: randomUUID(), name: 'Capture-Pro', productId: product.id, route: null, type: 'Secured', isActive: true };
  const state = {
    product, parents: [parent], menu: [], sfMenu: [], workspaceMenu: [], accountsMenu: [], competitorsMenu: [], bidBudgetsMenu: [], fabricationYardsMenu: [], vesselsMenu: [], syncMenu: [], legacyMenu: [], groups: [], grants: [],
    roles: ['Global Administrator', 'Organisation Administrator'].map((name) => ({ id: randomUUID(), name, scope: 'global', productId: null })),
  };
  const listFor = (route, name) => {
    if (route === captureProIntegrationRoute) return 'menu';
    if (route === captureProSalesforceOpportunitiesRoute) return 'sfMenu';
    if (route === captureProOpportunityWorkspaceRoute) return 'workspaceMenu';
    if (route === captureProSalesforceSyncRoute) return 'syncMenu';
    if (route === captureProSalesforceAccountsRoute) return 'accountsMenu';
    if (route === captureProSalesforceCompetitorsRoute) return 'competitorsMenu';
    if (route === captureProSalesforceBidBudgetsRoute) return 'bidBudgetsMenu';
    if (route === captureProSalesforceFabricationYardsRoute) return 'fabricationYardsMenu';
    if (route === captureProSalesforceVesselsRoute) return 'vesselsMenu';
    if (route === legacyCaptureProSalesforceOpportunitiesRoute) return 'legacyMenu';
    if (route === null && name === 'Salesforce') return 'groups';
    throw new Error('Unexpected menu write');
  };
  const menuLists = ['menu', 'sfMenu', 'workspaceMenu', 'accountsMenu', 'competitorsMenu', 'bidBudgetsMenu', 'fabricationYardsMenu', 'vesselsMenu', 'syncMenu', 'legacyMenu', 'groups'];
  const writes = [];
  let locks = 0;
  let rollbacks = 0;
  const dialect = new PgDialect();
  const tx = {
    execute: async (statement) => {
      assert.match(dialect.sqlToQuery(statement).sql, /pg_advisory_xact_lock/);
      locks++;
    },
    select: () => ({
      from: (table) => ({
        where: async (condition) => {
          const query = dialect.sqlToQuery(condition);
          switch (getTableName(table)) {
            case 'products':
              assert.deepEqual(query.params, ['Capture-Pro']);
              return state.product ? [state.product] : [];
            case 'menus':
              if (query.params[0] === captureProIntegrationRoute) return state.menu;
              if (query.params[0] === captureProSalesforceOpportunitiesRoute) return state.sfMenu;
              if (query.params[0] === captureProOpportunityWorkspaceRoute) return state.workspaceMenu;
              if (query.params[0] === captureProSalesforceSyncRoute) return state.syncMenu;
              if (query.params[0] === captureProSalesforceAccountsRoute) return state.accountsMenu;
              if (query.params[0] === captureProSalesforceCompetitorsRoute) return state.competitorsMenu;
              if (query.params[0] === captureProSalesforceBidBudgetsRoute) return state.bidBudgetsMenu;
              if (query.params[0] === captureProSalesforceFabricationYardsRoute) return state.fabricationYardsMenu;
              if (query.params[0] === captureProSalesforceVesselsRoute) return state.vesselsMenu;
              if (query.params[0] === legacyCaptureProSalesforceOpportunitiesRoute) return state.legacyMenu;
              if (query.params[1] === 'Salesforce') {
                assert.deepEqual(query.params, [product.id, 'Salesforce', 'Secured']);
                assert.match(query.sql, /"menus"\."route" is null/);
                assert.doesNotMatch(query.sql, /parent_id/);
                return state.groups;
              }
              assert.deepEqual(query.params, [product.id, 'Capture-Pro', 'Secured']);
              return state.parents;
            case 'roles':
              if (query.params.length === 1 && query.params[0] === 'global') {
                return state.roles.filter((role) => ['Global Administrator', 'Organisation Administrator'].includes(role.name));
              }
              return state.roles.filter((role) => query.params.includes(role.name));
            default: throw new Error('Unexpected setup read');
          }
        },
      }),
    }),
    insert: (table) => ({
      values: (value) => {
        const name = getTableName(table);
        assert.ok(['roles', 'menus', 'roles_menus'].includes(name));
        const menuList = () => state[listFor(value.route, value.name)];
        const apply = (conflict) => {
          writes.push(name);
          if (name === 'roles' && !state.roles.some((role) => role.name === value.name)) state.roles.push({ id: randomUUID(), ...value });
          if (name === 'roles_menus') {
            const existing = state.grants.find((grant) => grant.roleId === value.roleId && grant.menuId === value.menuId);
            if (!existing) state.grants.push({ ...value });
            else if (conflict) Object.assign(existing, conflict.set);
          }
          if (name === 'menus') menuList().push({ id: randomUUID(), ...value });
        };
        return {
          onConflictDoNothing: async () => apply(),
          onConflictDoUpdate: async (conflict) => apply(conflict),
          returning: async () => { apply(); return menuList().slice(-1); },
        };
      },
    }),
    update: (table) => ({
      set: (value) => ({
        where: (condition) => ({
          returning: async () => {
            assert.equal(getTableName(table), 'menus');
            const [id] = dialect.sqlToQuery(condition).params;
            writes.push('menus');
            for (const list of menuLists) state[list] = state[list].map((menu) => (menu.id === id ? { ...menu, ...value } : menu));
            return menuLists.flatMap((list) => state[list]).filter((menu) => menu.id === id);
          },
        }),
      }),
    }),
  };
  const db = {
    transaction: async (work) => {
      const snapshot = structuredClone(state);
      try {
        return await work(tx);
      } catch (error) {
        Object.assign(state, snapshot);
        rollbacks++;
        throw error;
      }
    },
  };
  return { db, state, writes, product, parent, locks: () => locks, rollbacks: () => rollbacks };
}

test('local-only setup accepts loopback hosts and rejects remote or overridden targets', () => {
  for (const url of ['postgresql://localhost/platform_core', 'postgres://127.0.0.1/platform_core?sslmode=disable', 'postgresql://[::1]/platform_core']) {
    assert.doesNotThrow(() => assertLocalCoreDatabase(url, 'development'));
  }
  for (const url of ['invalid', 'https://localhost/platform_core', 'postgresql://remote.example/platform_core', 'postgresql://localhost.evil.test/platform_core',
    'postgresql://localhost/platform_core?host=remote.example', 'postgresql://localhost/platform_core?hostaddr=remote.example',
    'postgresql://localhost/platform_core?options=override', 'postgresql:///platform_core']) {
    assert.throws(() => assertLocalCoreDatabase(url, 'development'));
  }
  assert.throws(() => assertLocalCoreDatabase('postgresql://localhost/platform_core', 'production'), /cannot run in production/);
});

test('registers only the product administrator role, secured menu and required grants', async () => {
  const f = fixture();
  const menu = await registerCaptureProIntegrationMenu(f.db);
  assert.equal(menu.route, captureProIntegrationRoute);
  assert.equal(menu.parentId, f.parent.id);
  assert.equal(menu.productId, f.product.id);
  assert.equal(menu.type, 'Secured');
  assert.equal(menu.isActive, true);
  assert.equal(f.state.roles.length, 3);
  assert.equal(f.state.grants.length, 6);
  assert.ok(f.writes.every((name) => ['roles', 'menus', 'roles_menus'].includes(name)));
  assert.equal(f.locks(), 1);
});

test('repeated registration preserves IDs and does not duplicate roles, menus or grants', async () => {
  const f = fixture();
  const first = await registerCaptureProIntegrationMenu(f.db);
  const roleIds = f.state.roles.map((role) => role.id);
  const second = await registerCaptureProIntegrationMenu(f.db);
  assert.equal(first.id, second.id);
  assert.deepEqual(f.state.roles.map((role) => role.id), roleIds);
  assert.equal(f.state.menu.length, 1);
  assert.equal(f.state.grants.length, 6);
  assert.equal(f.locks(), 2);
});

test('repairs an inactive integration menu without modifying its parent or product', async () => {
  const f = fixture();
  const existingId = randomUUID();
  f.state.menu = [{ id: existingId, productId: f.product.id, type: 'Secured', isActive: false }];
  const originalProduct = structuredClone(f.state.product);
  const originalParent = structuredClone(f.parent);
  const menu = await registerCaptureProIntegrationMenu(f.db);
  assert.equal(menu.id, existingId);
  assert.equal(menu.isActive, true);
  assert.deepEqual(f.state.product, originalProduct);
  assert.deepEqual(f.parent, originalParent);
});

for (const [name, change] of [
  ['missing product', (f) => { f.state.product = null; }],
  ['missing parent', (f) => { f.state.parents = []; }],
  ['inactive parent', (f) => { f.state.parents[0].isActive = false; }],
  ['duplicate parent', (f) => { f.state.parents.push({ ...f.parent, id: randomUUID() }); }],
  ['missing base role', (f) => { f.state.roles.pop(); }],
  ['role with different product', (f) => { f.state.roles.push({ ...captureProAdministratorRoleDefinition, id: randomUUID(), productId: randomUUID() }); }],
  ['role with wrong scope', (f) => { f.state.roles.push({ ...captureProAdministratorRoleDefinition, id: randomUUID(), productId: f.product.id, scope: 'org' }); }],
  ['menu owned by another product', (f) => { f.state.menu.push({ id: randomUUID(), productId: randomUUID(), type: 'Secured' }); }],
  ['public integration menu', (f) => { f.state.menu.push({ id: randomUUID(), productId: f.product.id, type: 'Global' }); }],
  ['duplicate integration menus', (f) => { f.state.menu.push(...Array.from({ length: 2 }, () => ({ id: randomUUID(), productId: f.product.id, type: 'Secured' }))); }],
]) {
  test(`rolls back registration for ${name}`, async () => {
    const f = fixture();
    change(f);
    const snapshot = structuredClone(f.state);
    await assert.rejects(registerCaptureProIntegrationMenu(f.db));
    assert.deepEqual(f.state, snapshot);
    assert.equal(f.rollbacks(), 1);
  });
}

function salesforceFixture() {
  const f = fixture();
  for (const name of [captureProAdministratorRoleDefinition.name, 'Capture-Pro Manager', 'Capture-Pro Analyst']) {
    f.state.roles.push({ id: randomUUID(), name, scope: 'global', productId: f.product.id });
  }
  f.state.roles.push({ id: randomUUID(), name: 'General User', scope: 'global', productId: null });
  return f;
}

const roleName = (f, id) => f.state.roles.find((role) => role.id === id).name;
const grantsFor = (f, menuId) => Object.fromEntries(f.state.grants.filter((grant) => grant.menuId === menuId).map((grant) => [roleName(f, grant.roleId), grant.accessMode]));

test('registers read-only Salesforce data screens and separate Capture-Pro workspace and sync screens', async () => {
  const f = salesforceFixture();
  const { group, opportunities, accounts, competitors, bidBudgets, fabricationYards, vessels, workspace, sync } = await registerCaptureProSalesforceMenus(f.db);
  assert.deepEqual(
    { name: group.name, route: group.route, parentId: group.parentId, productId: group.productId, type: group.type, isActive: group.isActive },
    { name: 'Salesforce', route: null, parentId: f.parent.id, productId: f.product.id, type: 'Secured', isActive: true },
  );
  assert.equal(group.displayOrder, 8);
  assert.deepEqual(Object.keys(grantsFor(f, f.parent.id)).sort(), [
    'Capture-Pro Analyst', 'Capture-Pro Manager', 'Capture-Pro Module Administrator', 'Global Administrator', 'Organisation Administrator',
  ]);
  assert.deepEqual([opportunities.name, opportunities.route, opportunities.parentId, opportunities.displayOrder], ['Opportunities', captureProSalesforceOpportunitiesRoute, group.id, 1]);
  assert.deepEqual([accounts.name, accounts.route, accounts.parentId, accounts.displayOrder], ['Accounts', captureProSalesforceAccountsRoute, group.id, 2]);
  assert.deepEqual([workspace.name, workspace.route, workspace.parentId, workspace.displayOrder], ['Opportunity Workspace', captureProOpportunityWorkspaceRoute, f.parent.id, 2]);
  assert.deepEqual([sync.name, sync.route, sync.parentId, sync.displayOrder], ['Sync & Health', captureProSalesforceSyncRoute, f.parent.id, 10]);
  assert.deepEqual([vessels.name, vessels.route, vessels.parentId, vessels.displayOrder, vessels.icon], ['Vessel Data', captureProSalesforceVesselsRoute, group.id, 6, 'ship']);
  assert.deepEqual([fabricationYards.name, fabricationYards.route, fabricationYards.parentId, fabricationYards.displayOrder, fabricationYards.icon], ['Fabrication Yard', captureProSalesforceFabricationYardsRoute, group.id, 5, 'factory']);
  assert.deepEqual([bidBudgets.name, bidBudgets.route, bidBudgets.parentId, bidBudgets.displayOrder, bidBudgets.icon], ['Bid Budget Data', captureProSalesforceBidBudgetsRoute, group.id, 4, 'wallet']);
  assert.deepEqual([competitors.name, competitors.route, competitors.parentId, competitors.displayOrder, competitors.icon], ['Competitors', captureProSalesforceCompetitorsRoute, group.id, 3, 'swords']);
  const viewers = {
    'Capture-Pro Analyst': 'readonly', 'Capture-Pro Manager': 'readonly', 'Capture-Pro Module Administrator': 'readonly',
    'Global Administrator': 'readonly', 'Organisation Administrator': 'readonly',
  };
  assert.deepEqual(grantsFor(f, group.id), viewers);
  assert.deepEqual(grantsFor(f, opportunities.id), viewers);
  assert.deepEqual(grantsFor(f, accounts.id), viewers);
  assert.deepEqual(grantsFor(f, competitors.id), viewers);
  assert.deepEqual(grantsFor(f, bidBudgets.id), viewers);
  assert.deepEqual(grantsFor(f, fabricationYards.id), viewers);
  assert.deepEqual(grantsFor(f, vessels.id), viewers);
  assert.deepEqual(grantsFor(f, workspace.id), viewers);
  const dataMenus = [opportunities, accounts, competitors, bidBudgets, fabricationYards, vessels];
  assert.ok(dataMenus.every((menu) => menu.parentId === group.id));
  assert.ok(dataMenus.every((menu) => Object.values(grantsFor(f, menu.id)).every((mode) => mode === 'readonly')));
  assert.deepEqual(grantsFor(f, sync.id), {
    ...viewers, 'Capture-Pro Module Administrator': 'editable', 'Global Administrator': 'editable', 'Organisation Administrator': 'editable',
  });
  assert.ok(!f.state.grants.some((grant) => roleName(f, grant.roleId) === 'General User'));
  assert.equal(f.state.roles.length, 6);
  assert.ok(f.writes.every((name) => ['menus', 'roles_menus'].includes(name)));
});

test('keeps Sync & Health immediately after Integrations as the final registered Capture-Pro menu', async () => {
  const f = salesforceFixture();
  const integrations = await registerCaptureProIntegrationMenu(f.db);
  const { group, workspace, sync } = await registerCaptureProSalesforceMenus(f.db);
  const siblings = [group, workspace, integrations, sync].sort((first, second) => first.displayOrder - second.displayOrder);
  assert.ok(siblings.every((menu) => menu.parentId === f.parent.id));
  assert.deepEqual(siblings.slice(-2).map((menu) => menu.name), ['Integrations', 'Sync & Health']);
  assert.equal(sync.displayOrder, integrations.displayOrder + 1);
});

test('moves the existing Opportunities menu into the Salesforce group in place and deactivates the legacy menu', async () => {
  const f = salesforceFixture();
  const existingId = randomUUID();
  const legacyId = randomUUID();
  f.state.sfMenu.push({ id: existingId, name: 'Salesforce Opportunities', route: captureProSalesforceOpportunitiesRoute, icon: 'cloud', type: 'Secured', productId: f.product.id, parentId: f.parent.id, displayOrder: 2, isActive: true });
  f.state.legacyMenu.push({ id: legacyId, name: 'Salesforce Opportunities', route: legacyCaptureProSalesforceOpportunitiesRoute, type: 'Secured', productId: f.product.id, parentId: f.parent.id, displayOrder: 8, isActive: true });
  const managerId = f.state.roles.find((role) => role.name === 'Capture-Pro Manager').id;
  f.state.grants.push({ roleId: managerId, menuId: existingId, accessMode: 'editable' }, { roleId: managerId, menuId: legacyId, accessMode: 'readonly' });
  const { group, opportunities } = await registerCaptureProSalesforceMenus(f.db);
  assert.equal(opportunities.id, existingId);
  assert.equal(opportunities.name, 'Opportunities');
  assert.equal(opportunities.parentId, group.id);
  assert.equal(grantsFor(f, existingId)['Capture-Pro Manager'], 'readonly');
  assert.equal(f.state.legacyMenu[0].isActive, false);
  assert.ok(f.state.grants.some((grant) => grant.menuId === legacyId), 'legacy grants are retained for audit');
});

test('moves an existing top-level Salesforce group under Capture-Pro in place and keeps existing Capture-Pro access', async () => {
  const f = salesforceFixture();
  const groupId = randomUUID();
  f.state.groups.push({ id: groupId, name: 'Salesforce', route: null, icon: 'cloud', type: 'Secured', productId: f.product.id, parentId: null, displayOrder: 7, isActive: true });
  const managerId = f.state.roles.find((role) => role.name === 'Capture-Pro Manager').id;
  f.state.grants.push({ roleId: managerId, menuId: f.parent.id, accessMode: 'editable' });
  const { group, opportunities, sync } = await registerCaptureProSalesforceMenus(f.db);
  assert.equal(group.id, groupId);
  assert.equal(group.parentId, f.parent.id);
  assert.equal(group.displayOrder, 8);
  assert.equal(f.state.groups.length, 1);
  assert.deepEqual([opportunities.parentId, sync.parentId], [groupId, f.parent.id]);
  assert.equal(grantsFor(f, f.parent.id)['Capture-Pro Manager'], 'editable');
});

test('repeated registration is idempotent and restores intended access modes', async () => {
  const f = salesforceFixture();
  const first = await registerCaptureProSalesforceMenus(f.db);
  const analystId = f.state.roles.find((role) => role.name === 'Capture-Pro Analyst').id;
  f.state.grants.find((grant) => grant.roleId === analystId && grant.menuId === first.sync.id).accessMode = 'editable';
  const second = await registerCaptureProSalesforceMenus(f.db);
  assert.deepEqual([second.group.id, second.opportunities.id, second.sync.id, second.workspace.id], [first.group.id, first.opportunities.id, first.sync.id, first.workspace.id]);
  assert.deepEqual([f.state.groups.length, f.state.sfMenu.length, f.state.accountsMenu.length, f.state.competitorsMenu.length, f.state.bidBudgetsMenu.length,   f.state.fabricationYardsMenu.length, f.state.vesselsMenu.length, f.state.syncMenu.length], [1, 1, 1, 1, 1, 1, 1, 1]);
  assert.equal(f.state.workspaceMenu.length, 1);
  assert.equal(f.state.grants.length, 50);
  assert.equal(grantsFor(f, first.sync.id)['Capture-Pro Analyst'], 'readonly');
});

for (const [name, change] of [
  ['missing product', (f) => { f.state.product = null; }],
  ['missing analyst role', (f) => { f.state.roles = f.state.roles.filter((role) => role.name !== 'Capture-Pro Analyst'); }],
  ['manager role owned by another product', (f) => { f.state.roles.find((role) => role.name === 'Capture-Pro Manager').productId = randomUUID(); }],
  ['administrator role bound to a product', (f) => { f.state.roles.find((role) => role.name === 'Global Administrator').productId = f.product.id; }],
  ['organisation-scoped viewer role', (f) => { f.state.roles.find((role) => role.name === 'Capture-Pro Analyst').scope = 'org'; }],
  ['missing Capture-Pro parent', (f) => { f.state.parents = []; }],
  ['inactive Capture-Pro parent', (f) => { f.state.parents[0].isActive = false; }],
  ['duplicate Capture-Pro parents', (f) => { f.state.parents.push({ ...f.parent, id: randomUUID() }); }],
  ['duplicate Salesforce groups', (f) => { f.state.groups.push(...Array.from({ length: 2 }, () => ({ id: randomUUID(), name: 'Salesforce', productId: f.product.id, type: 'Secured', route: null, parentId: null }))); }],
  ['opportunities menu owned by another product', (f) => { f.state.sfMenu.push({ id: randomUUID(), productId: randomUUID(), type: 'Secured' }); }],
  ['public sync menu', (f) => { f.state.syncMenu.push({ id: randomUUID(), productId: f.product.id, type: 'Global' }); }],
  ['workspace menu owned by another product', (f) => { f.state.workspaceMenu.push({ id: randomUUID(), productId: randomUUID(), type: 'Secured' }); }],
  ['duplicate workspace menus', (f) => { f.state.workspaceMenu.push(...Array.from({ length: 2 }, () => ({ id: randomUUID(), productId: f.product.id, type: 'Secured' }))); }],
  ['accounts menu owned by another product', (f) => { f.state.accountsMenu.push({ id: randomUUID(), productId: randomUUID(), type: 'Secured' }); }],
  ['public competitors menu', (f) => { f.state.competitorsMenu.push({ id: randomUUID(), productId: f.product.id, type: 'Global' }); }],
  ['bid budget menu owned by another product', (f) => { f.state.bidBudgetsMenu.push({ id: randomUUID(), productId: randomUUID(), type: 'Secured' }); }],
  ['public fabrication yard menu', (f) => { f.state.fabricationYardsMenu.push({ id: randomUUID(), productId: f.product.id, type: 'Global' }); }],
  ['vessel menu owned by another product', (f) => { f.state.vesselsMenu.push({ id: randomUUID(), productId: randomUUID(), type: 'Secured' }); }],
  ['duplicate sync menus', (f) => { f.state.syncMenu.push(...Array.from({ length: 2 }, () => ({ id: randomUUID(), productId: f.product.id, type: 'Secured' }))); }],
  ['legacy menu owned by another product', (f) => { f.state.legacyMenu.push({ id: randomUUID(), productId: randomUUID(), type: 'Secured', isActive: true }); }],
]) {
  test(`rolls back Salesforce menu registration for ${name}`, async () => {
    const f = salesforceFixture();
    change(f);
    const snapshot = structuredClone(f.state);
    await assert.rejects(registerCaptureProSalesforceMenus(f.db));
    assert.deepEqual(f.state, snapshot);
    assert.equal(f.rollbacks(), 1);
  });
}