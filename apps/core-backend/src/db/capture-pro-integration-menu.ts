import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { CoreDb } from './index';
import { menus, products, roles, rolesMenus } from './schema';

export const captureProIntegrationRoute = '/app/product/Capture-Pro/integrations';
export const captureProAdministratorRoleDefinition = {
  name: 'Capture-Pro Module Administrator',
  scope: 'global' as const,
  description: 'Configures Capture-Pro Salesforce and Spinergie integrations.',
};

export class CaptureProMenuSetupError extends Error {}

export function assertLocalCoreDatabase(connectionString: string, environment?: string) {
  if (environment === 'production') throw new CaptureProMenuSetupError('This setup command cannot run in production.');
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new CaptureProMenuSetupError('CORE_DATABASE_URL must be a valid local PostgreSQL URL.');
  }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || [...url.searchParams.keys()].some((key) => !['sslmode', 'connect_timeout', 'application_name'].includes(key))) {
    throw new CaptureProMenuSetupError('This command accepts only a loopback PostgreSQL host without connection-target overrides.');
  }
}

export async function registerCaptureProIntegrationMenu(db: CoreDb) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('capture-pro-integration-menu-setup'))`);
    const [product] = await tx.select().from(products).where(eq(products.code, 'Capture-Pro'));
    if (!product) throw new CaptureProMenuSetupError('A Capture-Pro product must already be registered.');
    const parents = await tx.select().from(menus).where(and(
      eq(menus.productId, product.id), eq(menus.name, 'Capture-Pro'), isNull(menus.route), eq(menus.type, 'Secured'),
    ));
    if (parents.length !== 1 || !parents[0].isActive) {
      throw new CaptureProMenuSetupError('Exactly one active Capture-Pro parent menu must already exist.');
    }
    const parent = parents[0];
    const administratorRoles = await tx.select().from(roles).where(and(
      sql`${roles.name} in ('Global Administrator', 'Organisation Administrator')`,
      eq(roles.scope, 'global'), isNull(roles.productId),
    ));
    if (administratorRoles.length !== 2) {
      throw new CaptureProMenuSetupError('The existing global and organisation administrator roles are required.');
    }
    await tx.insert(roles).values({ ...captureProAdministratorRoleDefinition, productId: product.id }).onConflictDoNothing({ target: roles.name });
    const [moduleRole] = await tx.select().from(roles).where(eq(roles.name, captureProAdministratorRoleDefinition.name));
    if (!moduleRole || moduleRole.productId !== product.id || moduleRole.scope !== 'global') {
      throw new CaptureProMenuSetupError('The Capture-Pro administrator role has conflicting ownership or scope.');
    }
    const existingMenus = await tx.select().from(menus).where(eq(menus.route, captureProIntegrationRoute));
    if (existingMenus.length > 1 || existingMenus.some((menu) => menu.productId !== product.id || menu.type !== 'Secured')) {
      throw new CaptureProMenuSetupError('The Integrations route has duplicate records or conflicting ownership.');
    }
    const definition = {
      name: 'Integrations', route: captureProIntegrationRoute, icon: 'key-round', type: 'Secured' as const,
      parentId: parent.id, productId: product.id, displayOrder: 9, isActive: true,
    };
    const [menu] = existingMenus.length
      ? await tx.update(menus).set(definition).where(eq(menus.id, existingMenus[0].id)).returning()
      : await tx.insert(menus).values(definition).returning();
    if (!menu) throw new CaptureProMenuSetupError('The Integrations menu could not be registered.');
    for (const role of [...administratorRoles, moduleRole]) {
      await tx.insert(rolesMenus).values({ roleId: role.id, menuId: parent.id, accessMode: 'editable' }).onConflictDoNothing();
      await tx.insert(rolesMenus).values({ roleId: role.id, menuId: menu.id, accessMode: 'editable' }).onConflictDoUpdate({
        target: [rolesMenus.roleId, rolesMenus.menuId], set: { accessMode: 'editable' },
      });
    }
    return menu;
  });
}

export const captureProSalesforceOpportunitiesRoute = '/app/product/Capture-Pro/opportunities';
export const captureProSpinergieVesselsRoute = '/app/product/Capture-Pro/spinergie-vessels';
export const captureProSpinergieChartersRoute = '/app/product/Capture-Pro/spinergie-charters';
export const captureProOpportunityWorkspaceRoute = '/app/product/Capture-Pro/opportunity-workspace';
export const captureProSalesforceSyncRoute = '/app/product/Capture-Pro/salesforce-sync';
export const captureProSalesforceAccountsRoute = '/app/product/Capture-Pro/accounts';
export const captureProSalesforceCompetitorsRoute = '/app/product/Capture-Pro/competitors';
export const captureProSalesforceBidBudgetsRoute = '/app/product/Capture-Pro/bid-budgets';
export const captureProSalesforceFabricationYardsRoute = '/app/product/Capture-Pro/fabrication-yards';
export const captureProSalesforceVesselsRoute = '/app/product/Capture-Pro/vessels';
export const legacyCaptureProSalesforceOpportunitiesRoute = '/app/product/Capture-Pro/salesforce-opportunities';
const salesforceAdministratorRoles = ['Global Administrator', 'Organisation Administrator', captureProAdministratorRoleDefinition.name];
const salesforceViewerRoles = [...salesforceAdministratorRoles, 'Capture-Pro Manager', 'Capture-Pro Analyst'];

export async function registerCaptureProSpinergieMenus(db: CoreDb) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('capture-pro-integration-menu-setup'))`);
    const [product] = await tx.select().from(products).where(eq(products.code, 'Capture-Pro'));
    if (!product) throw new CaptureProMenuSetupError('A Capture-Pro product must already be registered.');
    const parents = await tx.select().from(menus).where(and(eq(menus.productId, product.id), eq(menus.name, 'Capture-Pro'), isNull(menus.route), eq(menus.type, 'Secured')));
    if (parents.length !== 1 || !parents[0].isActive) throw new CaptureProMenuSetupError('Exactly one active Capture-Pro parent menu must already exist.');
    const viewerRoles = await tx.select().from(roles).where(inArray(roles.name, salesforceViewerRoles));
    for (const name of salesforceViewerRoles) {
      const role = viewerRoles.find((candidate) => candidate.name === name);
      if (!role || role.scope !== 'global' || role.productId !== (name.startsWith('Capture-Pro') ? product.id : null)) {
        throw new CaptureProMenuSetupError(`The ${name} role is missing or has conflicting ownership or scope.`);
      }
    }
    const groups = await tx.select().from(menus).where(and(eq(menus.productId, product.id), eq(menus.name, 'Spinergie'), isNull(menus.route), eq(menus.type, 'Secured')));
    if (groups.length > 1) throw new CaptureProMenuSetupError('Duplicate Spinergie menu groups exist.');
    const groupDefinition = { name: 'Spinergie', route: null, icon: 'ship', type: 'Secured' as const, parentId: parents[0].id, productId: product.id, displayOrder: 7, isActive: true };
    const [group] = groups.length ? await tx.update(menus).set(groupDefinition).where(eq(menus.id, groups[0].id)).returning()
      : await tx.insert(menus).values(groupDefinition).returning();
    if (!group) throw new CaptureProMenuSetupError('The Spinergie menu group could not be registered.');
    const existing = await tx.select().from(menus).where(eq(menus.route, captureProSpinergieVesselsRoute));
    if (existing.length > 1 || existing.some((menu) => menu.productId !== product.id || menu.type !== 'Secured')) throw new CaptureProMenuSetupError('The Spinergie vessel route has duplicate records or conflicting ownership.');
    const definition = { name: 'Vessel Specifications', route: captureProSpinergieVesselsRoute, icon: 'ship', type: 'Secured' as const, parentId: group.id, productId: product.id, displayOrder: 1, isActive: true };
    const [vessels] = existing.length ? await tx.update(menus).set(definition).where(eq(menus.id, existing[0].id)).returning()
      : await tx.insert(menus).values(definition).returning();
    if (!vessels) throw new CaptureProMenuSetupError('Spinergie vessel specifications could not be registered.');
    const existingCharters = await tx.select().from(menus).where(eq(menus.route, captureProSpinergieChartersRoute));
    if (existingCharters.length > 1 || existingCharters.some((menu) => menu.productId !== product.id || menu.type !== 'Secured')) throw new CaptureProMenuSetupError('The Spinergie charter route has duplicate records or conflicting ownership.');
    const charterDefinition = { name: 'Vessel Charters', route: captureProSpinergieChartersRoute, icon: 'ship', type: 'Secured' as const, parentId: group.id, productId: product.id, displayOrder: 2, isActive: true };
    const [charters] = existingCharters.length ? await tx.update(menus).set(charterDefinition).where(eq(menus.id, existingCharters[0].id)).returning()
      : await tx.insert(menus).values(charterDefinition).returning();
    if (!charters) throw new CaptureProMenuSetupError('Spinergie vessel charters could not be registered.');
    for (const role of viewerRoles) {
      await tx.insert(rolesMenus).values({ roleId: role.id, menuId: parents[0].id, accessMode: 'readonly' }).onConflictDoNothing();
      for (const menu of [group, vessels, charters]) {
        await tx.insert(rolesMenus).values({ roleId: role.id, menuId: menu.id, accessMode: 'readonly' }).onConflictDoUpdate({ target: [rolesMenus.roleId, rolesMenus.menuId], set: { accessMode: 'readonly' } });
      }
    }
    return { group, vessels, charters };
  });
}

export async function registerCaptureProSalesforceMenus(db: CoreDb) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('capture-pro-integration-menu-setup'))`);
    const [product] = await tx.select().from(products).where(eq(products.code, 'Capture-Pro'));
    if (!product) throw new CaptureProMenuSetupError('A Capture-Pro product must already be registered.');
    const captureProParents = await tx.select().from(menus).where(and(
      eq(menus.productId, product.id), eq(menus.name, 'Capture-Pro'), isNull(menus.route), eq(menus.type, 'Secured'),
    ));
    if (captureProParents.length !== 1 || !captureProParents[0].isActive) {
      throw new CaptureProMenuSetupError('Exactly one active Capture-Pro parent menu must already exist.');
    }
    const captureProParent = captureProParents[0];
    const viewerRoles = await tx.select().from(roles).where(inArray(roles.name, salesforceViewerRoles));
    for (const name of salesforceViewerRoles) {
      const role = viewerRoles.find((candidate) => candidate.name === name);
      const expectedProductId = name.startsWith('Capture-Pro') ? product.id : null;
      if (!role || role.scope !== 'global' || role.productId !== expectedProductId) {
        throw new CaptureProMenuSetupError(`The ${name} role is missing or has conflicting ownership or scope.`);
      }
    }

    // Matches the group wherever it currently sits so an earlier top-level group is moved in place.
    const groups = await tx.select().from(menus).where(and(
      eq(menus.productId, product.id), eq(menus.name, 'Salesforce'), isNull(menus.route), eq(menus.type, 'Secured'),
    ));
    if (groups.length > 1) throw new CaptureProMenuSetupError('Duplicate Salesforce menu groups exist.');
    const groupDefinition = {
      name: 'Salesforce', route: null, icon: 'cloud', type: 'Secured' as const, parentId: captureProParent.id, productId: product.id, displayOrder: 8, isActive: true,
    };
    const [group] = groups.length
      ? await tx.update(menus).set(groupDefinition).where(eq(menus.id, groups[0].id)).returning()
      : await tx.insert(menus).values(groupDefinition).returning();
    if (!group) throw new CaptureProMenuSetupError('The Salesforce menu group could not be registered.');

    const upsertChild = async (route: string, name: string, icon: string, displayOrder: number, parentId = group.id) => {
      const existing = await tx.select().from(menus).where(eq(menus.route, route));
      if (existing.length > 1 || existing.some((menu) => menu.productId !== product.id || menu.type !== 'Secured')) {
        throw new CaptureProMenuSetupError(`The ${name} route has duplicate records or conflicting ownership.`);
      }
      const definition = { name, route, icon, type: 'Secured' as const, parentId, productId: product.id, displayOrder, isActive: true };
      const [menu] = existing.length
        ? await tx.update(menus).set(definition).where(eq(menus.id, existing[0].id)).returning()
        : await tx.insert(menus).values(definition).returning();
      if (!menu) throw new CaptureProMenuSetupError(`The ${name} menu could not be registered.`);
      return menu;
    };
    const opportunities = await upsertChild(captureProSalesforceOpportunitiesRoute, 'Opportunities', 'radar', 1);
    const accounts = await upsertChild(captureProSalesforceAccountsRoute, 'Accounts', 'building-2', 2);
    const competitors = await upsertChild(captureProSalesforceCompetitorsRoute, 'Competitors', 'swords', 3);
    const bidBudgets = await upsertChild(captureProSalesforceBidBudgetsRoute, 'Bid Budget Data', 'wallet', 4);
    const fabricationYards = await upsertChild(captureProSalesforceFabricationYardsRoute, 'Fabrication Yard', 'factory', 5);
    const vessels = await upsertChild(captureProSalesforceVesselsRoute, 'Vessel Data', 'ship', 6);
    const workspace = await upsertChild(captureProOpportunityWorkspaceRoute, 'Opportunity Workspace', 'folder-open', 2, captureProParent.id);
    const sync = await upsertChild(captureProSalesforceSyncRoute, 'Sync & Health', 'activity', 10, captureProParent.id);

    const legacyMenus = await tx.select().from(menus).where(eq(menus.route, legacyCaptureProSalesforceOpportunitiesRoute));
    if (legacyMenus.some((menu) => menu.productId !== product.id || menu.type !== 'Secured')) {
      throw new CaptureProMenuSetupError('The former Salesforce Opportunities route has conflicting ownership.');
    }
    // The former separate menu is deactivated rather than deleted so its grants remain auditable.
    for (const legacy of legacyMenus.filter((candidate) => candidate.isActive)) {
      await tx.update(menus).set({ isActive: false }).where(eq(menus.id, legacy.id)).returning();
    }

    const setGrant = (roleId: string, menuId: string, accessMode: 'readonly' | 'editable') => tx.insert(rolesMenus)
      .values({ roleId, menuId, accessMode })
      .onConflictDoUpdate({ target: [rolesMenus.roleId, rolesMenus.menuId], set: { accessMode } });
    for (const role of viewerRoles) {
      const administrator = salesforceAdministratorRoles.includes(role.name);
      // Existing Capture-Pro parent grants are kept as-is; only missing ones are added so the nested group is reachable.
      await tx.insert(rolesMenus).values({ roleId: role.id, menuId: captureProParent.id, accessMode: 'readonly' }).onConflictDoNothing();
      await setGrant(role.id, group.id, 'readonly');
      await setGrant(role.id, opportunities.id, 'readonly');
      await setGrant(role.id, accounts.id, 'readonly');
      await setGrant(role.id, competitors.id, 'readonly');
      await setGrant(role.id, bidBudgets.id, 'readonly');
      await setGrant(role.id, fabricationYards.id, 'readonly');
      await setGrant(role.id, vessels.id, 'readonly');
      await setGrant(role.id, workspace.id, 'readonly');
      await setGrant(role.id, sync.id, administrator ? 'editable' : 'readonly');
    }
    return { group, opportunities, accounts, competitors, bidBudgets, fabricationYards, vessels, workspace, sync };
  });
}