import { config } from 'dotenv';
import { resolve } from 'node:path';
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { createDb, createPool } from './index';
import {
  assertLocalCoreDatabase, CaptureProMenuSetupError, registerCaptureProIntegrationMenu, registerCaptureProSalesforceMenus, registerCaptureProSpinergieMenus,
} from './capture-pro-integration-menu';
import { organisationModules, organisations, roles, rolesMenus, userRoles } from './schema';
import { MenusService, type MenuNode } from '../menus/menus.service';

config({ path: resolve(__dirname, '../../../../.env') });

const containsMenu = (nodes: MenuNode[], id: string): boolean => nodes.some((node) => node.id === id || containsMenu(node.children, id));

async function main() {
  const connectionString = process.env.CORE_DATABASE_URL;
  if (!connectionString) throw new CaptureProMenuSetupError('CORE_DATABASE_URL is not configured.');
  assertLocalCoreDatabase(connectionString, process.env.NODE_ENV);
  const pool = createPool(connectionString);
  try {
    const db = createDb(pool);
    const integrations = await registerCaptureProIntegrationMenu(db);
    const salesforce = await registerCaptureProSalesforceMenus(db);
    const spinergie = await registerCaptureProSpinergieMenus(db);
    const registered = [integrations, salesforce.group, salesforce.opportunities, salesforce.accounts, salesforce.competitors, salesforce.bidBudgets, salesforce.fabricationYards, salesforce.vessels, salesforce.workspace, salesforce.sync, spinergie.group, spinergie.vessels, spinergie.charters];
    const productId = registered[0].productId;
    if (!productId) throw new CaptureProMenuSetupError('The registered menu is missing its Capture-Pro product.');
    const now = new Date();
    const assignments = await db.select({ orgId: organisationModules.orgId }).from(organisationModules)
      .innerJoin(organisations, eq(organisations.id, organisationModules.orgId)).where(and(
        eq(organisationModules.productId, productId), eq(organisationModules.status, 'active'),
        eq(organisations.status, 'active'), lte(organisationModules.validFrom, now),
        or(isNull(organisationModules.validTo), gt(organisationModules.validTo, now)),
      ));
    const [administrator] = await db.select({ userId: userRoles.userId }).from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId)).where(and(eq(roles.name, 'Global Administrator'), isNull(userRoles.orgId))).limit(1);
    const menusService = new MenusService(db);
    const results = [];
    for (const menu of registered) {
      const grants = await db.select({ name: roles.name, accessMode: rolesMenus.accessMode }).from(rolesMenus)
        .innerJoin(roles, eq(roles.id, rolesMenus.roleId)).where(eq(rolesMenus.menuId, menu.id));
      let verifiedMenuCount = 0;
      if (administrator) {
        for (const { orgId } of assignments) {
          const tree = await menusService.menusForUser({
            id: administrator.userId, globalRoles: ['Global Administrator'], b2cOid: '', displayName: '', email: '',
          }, orgId);
          if (containsMenu(tree, menu.id)) verifiedMenuCount++;
        }
      }
      results.push({
        name: menu.name,
        route: menu.route,
        menuActive: menu.isActive,
        rolesWithMenuAccess: grants.filter(({ name }) => name === 'Global Administrator'
          || name === 'Organisation Administrator' || name.startsWith('Capture-Pro ')).map(({ name, accessMode }) => `${name} (${accessMode})`).sort(),
        globalAdministratorMenuVerifiedForOrganisations: verifiedMenuCount,
      });
    }
    console.log(JSON.stringify({
      menus: results,
      activeOrganisationAssignments: assignments.length,
      usersAndOrganisationAssignmentsChanged: false,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof CaptureProMenuSetupError
    ? error.message
    : 'Capture-Pro menu setup failed. Check local core database connectivity and the existing schema.');
  process.exitCode = 1;
});
