import { config } from 'dotenv';
import { resolve } from 'node:path';
import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import { createDb, createPool } from './index';
import { hashPassword } from '../common/password';
import {
  appSettings,
  menus,
  organisations,
  organisationModules,
  organisationUsers,
  products,
  roles,
  rolesMenus,
  userRoles,
  users,
} from './schema';

config({ path: resolve(__dirname, '../../../../.env') });

// Idempotent seed: canonical organisation, default memberships/modules, base roles, products, public menus.
async function main() {
  const url = process.env.CORE_DATABASE_URL;
  if (!url) throw new Error('CORE_DATABASE_URL is not set');
  const pool = createPool(url);
  const db = createDb(pool);

  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@global.local';
  const adminName = process.env.SEED_ADMIN_DISPLAY_NAME ?? 'Admin';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  console.log('Seeding core platform data...');

  // --- Roles ---
  const roleDefs = [
    { name: 'Global Administrator', scope: 'global' as const, description: 'Full platform administration.' },
    { name: 'Organisation Administrator', scope: 'global' as const, description: 'Administers organisations through organisation membership.' },
    { name: 'General User', scope: 'global' as const, description: 'Standard application user.' },
  ];
  for (const r of roleDefs) {
    await db
      .insert(roles)
      .values(r)
      .onConflictDoUpdate({
        target: roles.name,
        set: { scope: r.scope, description: r.description, productId: null },
      });
  }
  const [globalAdminRole] = await db.select().from(roles).where(eq(roles.name, 'Global Administrator'));

  // --- Admin user ---
  const adminPasswordHash = await hashPassword(adminPassword);
  let [admin] = await db.select().from(users).where(eq(users.email, adminEmail));
  if (!admin) {
    [admin] = await db
      .insert(users)
      .values({ email: adminEmail, displayName: adminName, passwordHash: adminPasswordHash, status: 'active' })
      .returning();
  } else if (!admin.passwordHash) {
    // Backfill a password for a previously seeded (B2C-only) Admin.
    [admin] = await db
      .update(users)
      .set({ passwordHash: adminPasswordHash, updatedAt: new Date() })
      .where(eq(users.id, admin.id))
      .returning();
  }

  // --- Canonical organisation ---
  let [globalOrg] = await db.select().from(organisations).where(eq(organisations.slug, 'mcdermott-it'));
  if (!globalOrg) {
    [globalOrg] = await db.select().from(organisations).where(eq(organisations.slug, 'global'));
  }
  if (!globalOrg) {
    [globalOrg] = await db
      .insert(organisations)
      .values({ name: 'McDermott IT', slug: 'mcdermott-it', status: 'active', ownerUserId: admin.id })
      .returning();
  } else {
    [globalOrg] = await db
      .update(organisations)
      .set({ name: 'McDermott IT', slug: 'mcdermott-it', status: 'active', ownerUserId: admin.id })
      .where(eq(organisations.id, globalOrg.id))
      .returning();
  }

  // Intentional convergence: the seeded platform has one tenant.
  await db.delete(organisations).where(ne(organisations.id, globalOrg.id));

  const allUsers = await db.select({ id: users.id }).from(users);
  for (const user of allUsers) {
    await db
      .insert(organisationUsers)
      .values({
        orgId: globalOrg.id,
        userId: user.id,
        membership: user.id === admin.id ? 'Owner' : 'Member',
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [organisationUsers.orgId, organisationUsers.userId],
        set: { membership: user.id === admin.id ? 'Owner' : 'Member', status: 'active', updatedAt: new Date() },
      });
  }

  // --- Admin is Owner of Global + Global Administrator role ---
  await db
    .insert(organisationUsers)
    .values({ orgId: globalOrg.id, userId: admin.id, membership: 'Owner', status: 'active' })
    .onConflictDoNothing();
  if (globalAdminRole) {
    const existing = await db
      .select()
      .from(userRoles)
      .where(and(eq(userRoles.userId, admin.id), eq(userRoles.roleId, globalAdminRole.id), isNull(userRoles.orgId)));
    if (existing.length === 0) {
      await db.insert(userRoles).values({ userId: admin.id, roleId: globalAdminRole.id, orgId: null });
    }
  }

  // --- Products ---
  const productDefs = [
    { code: 'CreditGuard', name: 'CreditGuard', description: 'Parent Company Guarantee.' },
    { code: 'PRIME', name: 'PRIME', description: 'Project Requirements & Ident Material Engine.' },
  ];
  for (const p of productDefs) {
    await db.insert(products).values(p).onConflictDoNothing({ target: products.code });
  }
  const allProducts = await db.select({ id: products.id }).from(products);
  const defaultLicensedSeats = Math.max(allUsers.length, 1);
  for (const product of allProducts) {
    const [existingModule] = await db
      .select({ id: organisationModules.id, licensedSeats: organisationModules.licensedSeats })
      .from(organisationModules)
      .where(and(eq(organisationModules.orgId, globalOrg.id), eq(organisationModules.productId, product.id)));
    if (existingModule) {
      await db
        .update(organisationModules)
        .set({ status: 'active', licensedSeats: Math.max(existingModule.licensedSeats, defaultLicensedSeats), validTo: null })
        .where(eq(organisationModules.id, existingModule.id));
    } else {
      await db.insert(organisationModules).values({
        orgId: globalOrg.id,
        productId: product.id,
        licensedSeats: defaultLicensedSeats,
        status: 'active',
        validTo: null,
      });
    }
  }
  const [creditGuardProduct] = await db.select().from(products).where(eq(products.code, 'CreditGuard'));
  if (creditGuardProduct) {
    const creditGuardRoleDefs = [
      {
        name: 'CreditGuard Requestor',
        scope: 'global' as const,
        description: 'Creates and manages CreditGuard requests.',
      },
      {
        name: 'CreditGuard Reviewer',
        scope: 'global' as const,
        description: 'Reviews CreditGuard requests and portfolio reports.',
      },
    ];
    for (const role of creditGuardRoleDefs) {
      await db
        .insert(roles)
        .values({ ...role, productId: creditGuardProduct.id })
        .onConflictDoUpdate({
          target: roles.name,
          set: {
            scope: role.scope,
            description: role.description,
            productId: creditGuardProduct.id,
          },
        });
    }
  }

  // --- Public (Global) menus ---
  const publicMenus = [
    { name: 'Marketing', route: '/', icon: 'home', displayOrder: 1 },
    { name: 'Sign In', route: '/signin', icon: 'log-in', displayOrder: 2 },
    { name: 'Sign Up', route: '/signup', icon: 'user-plus', displayOrder: 3 },
    { name: 'About', route: '/about', icon: 'info', displayOrder: 4 },
  ];
  for (const m of publicMenus) {
    const exists = await db.select().from(menus).where(eq(menus.route, m.route));
    if (exists.length === 0) {
      await db.insert(menus).values({ ...m, type: 'Global', isActive: true });
    }
  }

  // --- Secured application menus + role grants (drive the in-app sidebar) ---
  const [orgAdminRole] = await db
    .select()
    .from(roles)
    .where(eq(roles.name, 'Organisation Administrator'));
  const [generalUserRole] = await db.select().from(roles).where(eq(roles.name, 'General User'));
  const [creditGuardRequestorRole] = await db.select().from(roles).where(eq(roles.name, 'CreditGuard Requestor'));
  const [creditGuardReviewerRole] = await db.select().from(roles).where(eq(roles.name, 'CreditGuard Reviewer'));

  for (const role of [creditGuardRequestorRole, creditGuardReviewerRole]) {
    if (!role) continue;
    const assignments = await db
      .select({ id: userRoles.id, userId: userRoles.userId, orgId: userRoles.orgId })
      .from(userRoles)
      .where(eq(userRoles.roleId, role.id));
    for (const userId of new Set(assignments.map(({ userId }) => userId))) {
      if (!assignments.some((assignment) => assignment.userId === userId && assignment.orgId === null)) {
        await db.insert(userRoles).values({ userId, roleId: role.id, orgId: null });
      }
    }
    const scopedAssignmentIds = assignments.filter(({ orgId }) => orgId !== null).map(({ id }) => id);
    if (scopedAssignmentIds.length > 0) {
      await db
        .delete(userRoles)
        .where(and(eq(userRoles.roleId, role.id), inArray(userRoles.id, scopedAssignmentIds)));
    }
  }

  type MenuDef = {
    name: string;
    route: string | null;
    icon: string;
    parentId?: string;
    productId?: string;
    displayOrder: number;
  };

  const upsertMenu = async (def: MenuDef) => {
    const where = def.route ? eq(menus.route, def.route) : eq(menus.name, def.name);
    let [row] = await db.select().from(menus).where(where);
    if (!row) {
      [row] = await db
        .insert(menus)
        .values({
          name: def.name,
          route: def.route,
          icon: def.icon,
          type: 'Secured',
          parentId: def.parentId ?? null,
          productId: def.productId ?? null,
          displayOrder: def.displayOrder,
          isActive: true,
        })
        .returning();
    } else {
      [row] = await db
        .update(menus)
        .set({
          name: def.name,
          icon: def.icon,
          parentId: def.parentId ?? null,
          productId: def.productId ?? null,
          displayOrder: def.displayOrder,
          isActive: true,
        })
        .where(eq(menus.id, row.id))
        .returning();
    }
    return row;
  };

  const grant = async (
    menuId: string,
    roleIds: (string | undefined)[],
    accessMode: 'readonly' | 'editable' = 'editable',
  ) => {
    for (const roleId of roleIds) {
      if (!roleId) continue;
      await db
        .insert(rolesMenus)
        .values({ roleId, menuId, accessMode })
        .onConflictDoUpdate({
          target: [rolesMenus.roleId, rolesMenus.menuId],
          set: { accessMode },
        });
    }
  };

  const everyRole = [
    globalAdminRole?.id,
    orgAdminRole?.id,
    generalUserRole?.id,
    creditGuardRequestorRole?.id,
    creditGuardReviewerRole?.id,
  ];

  // Workspace group — visible to all authenticated roles.
  const workspace = await upsertMenu({ name: 'Workspace', route: null, icon: 'layout-dashboard', displayOrder: 1 });
  await grant(workspace.id, everyRole);
  const dashboard = await upsertMenu({ name: 'Dashboard', route: '/app/dashboard', icon: 'gauge', parentId: workspace.id, displayOrder: 1 });
  await grant(dashboard.id, everyRole);
  const productsMenu = await upsertMenu({ name: 'Products', route: '/app/products', icon: 'boxes', parentId: workspace.id, displayOrder: 2 });
  await grant(productsMenu.id, everyRole);

  if (creditGuardProduct) {
    const creditGuardRoles = [
      globalAdminRole?.id,
      orgAdminRole?.id,
      creditGuardRequestorRole?.id,
      creditGuardReviewerRole?.id,
    ];
    const creditGuardMenu = await upsertMenu({ name: 'CreditGuard', route: null, icon: 'shield-check', productId: creditGuardProduct.id, displayOrder: 5 });
    await grant(creditGuardMenu.id, creditGuardRoles);
    const creditGuardOverviewMenu = await upsertMenu({ name: 'Overview', route: '/app/product/CreditGuard', icon: 'layout-dashboard', parentId: creditGuardMenu.id, productId: creditGuardProduct.id, displayOrder: 1 });
    await grant(creditGuardOverviewMenu.id, creditGuardRoles, 'readonly');
    const creditGuardRequestsMenu = await upsertMenu({ name: 'Requests', route: '/app/product/CreditGuard/requests', icon: 'file-pen-line', parentId: creditGuardMenu.id, productId: creditGuardProduct.id, displayOrder: 2 });
    await grant(creditGuardRequestsMenu.id, [globalAdminRole?.id, orgAdminRole?.id, creditGuardRequestorRole?.id, creditGuardReviewerRole?.id]);
    const creditGuardReportsMenu = await upsertMenu({ name: 'Reports', route: '/app/product/CreditGuard/reports', icon: 'chart-no-axes-combined', parentId: creditGuardMenu.id, productId: creditGuardProduct.id, displayOrder: 3 });
    await grant(creditGuardReportsMenu.id, [globalAdminRole?.id, orgAdminRole?.id, creditGuardReviewerRole?.id], 'readonly');
    const creditGuardApplicationSetupMenu = await upsertMenu({ name: 'Application Setup', route: null, icon: 'settings-2', parentId: creditGuardMenu.id, productId: creditGuardProduct.id, displayOrder: 4 });
    await grant(creditGuardApplicationSetupMenu.id, [globalAdminRole?.id, orgAdminRole?.id]);
    const creditGuardBusinessEntitiesMenu = await upsertMenu({ name: 'Business Entities', route: '/app/product/CreditGuard/application-setup/business-entities', icon: 'building-2', parentId: creditGuardApplicationSetupMenu.id, productId: creditGuardProduct.id, displayOrder: 1 });
    await grant(creditGuardBusinessEntitiesMenu.id, [globalAdminRole?.id, orgAdminRole?.id]);
    const creditGuardModuleUsersMenu = await upsertMenu({ name: 'Module Users', route: '/app/product/CreditGuard/application-setup/module-users', icon: 'users-round', parentId: creditGuardApplicationSetupMenu.id, productId: creditGuardProduct.id, displayOrder: 2 });
    await grant(creditGuardModuleUsersMenu.id, [globalAdminRole?.id, orgAdminRole?.id]);
    const creditGuardIntegrationMenu = await upsertMenu({ name: 'Integration', route: '/app/product/CreditGuard/application-setup/integration', icon: 'key-round', parentId: creditGuardApplicationSetupMenu.id, productId: creditGuardProduct.id, displayOrder: 3 });
    await grant(creditGuardIntegrationMenu.id, [globalAdminRole?.id, orgAdminRole?.id]);
    if (generalUserRole) {
      await db
        .delete(rolesMenus)
        .where(
          and(
            eq(rolesMenus.roleId, generalUserRole.id),
            inArray(rolesMenus.menuId, [
              creditGuardMenu.id,
              creditGuardOverviewMenu.id,
              creditGuardRequestsMenu.id,
              creditGuardReportsMenu.id,
              creditGuardApplicationSetupMenu.id,
              creditGuardBusinessEntitiesMenu.id,
              creditGuardModuleUsersMenu.id,
              creditGuardIntegrationMenu.id,
            ]),
          ),
        );
    }
  }

  // Preserve the existing parent ID (and any custom role assignments) while renaming it.
  const [existingGlobalAdministration] = await db
    .select()
    .from(menus)
    .where(eq(menus.name, 'Global Administration'));
  if (!existingGlobalAdministration) {
    const [legacyAdministration] = await db.select().from(menus).where(eq(menus.name, 'Administration'));
    if (legacyAdministration) {
      await db
        .update(menus)
        .set({ name: 'Global Administration' })
        .where(eq(menus.id, legacyAdministration.id));
    }
  }

  const globalAdministration = await upsertMenu({ name: 'Global Administration', route: null, icon: 'shield', displayOrder: 10 });
  await grant(globalAdministration.id, [globalAdminRole?.id]);
  const administration = await upsertMenu({ name: 'Administration', route: null, icon: 'building-cog', displayOrder: 11 });
  await grant(administration.id, [globalAdminRole?.id, orgAdminRole?.id]);

  const usersMenu = await upsertMenu({ name: 'Global Users', route: '/admin/users', icon: 'users', parentId: globalAdministration.id, displayOrder: 1 });
  await grant(usersMenu.id, [globalAdminRole?.id]);
  const projectsMenu = await upsertMenu({ name: 'Global Projects', route: '/admin/projects', icon: 'folder-kanban', parentId: globalAdministration.id, displayOrder: 2 });
  await grant(projectsMenu.id, [globalAdminRole?.id]);
  const orgsMenu = await upsertMenu({ name: 'Organisations', route: '/admin/organisations', icon: 'building-2', parentId: globalAdministration.id, displayOrder: 3 });
  await grant(orgsMenu.id, [globalAdminRole?.id]);
  const licensesMenu = await upsertMenu({ name: 'Module Assignments', route: '/admin/licenses', icon: 'package-check', parentId: globalAdministration.id, displayOrder: 4 });
  await grant(licensesMenu.id, [globalAdminRole?.id]);
  const connectionsMenu = await upsertMenu({ name: 'Product Connections', route: '/admin/connections', icon: 'database', parentId: globalAdministration.id, displayOrder: 5 });
  await grant(connectionsMenu.id, [globalAdminRole?.id]);
  const rolesMenu = await upsertMenu({ name: 'Role Management', route: '/admin/roles', icon: 'shield-check', parentId: globalAdministration.id, displayOrder: 6 });
  await grant(rolesMenu.id, [globalAdminRole?.id]);
  const userAssignmentsMenu = await upsertMenu({ name: 'User Assignments', route: '/admin/user-assignments', icon: 'user-cog', parentId: globalAdministration.id, displayOrder: 7 });
  await grant(userAssignmentsMenu.id, [globalAdminRole?.id]);
  const sessionsMenu = await upsertMenu({ name: 'Sessions', route: '/admin/sessions', icon: 'monitor-dot', parentId: globalAdministration.id, displayOrder: 8 });
  await grant(sessionsMenu.id, [globalAdminRole?.id]);
  const settingsMenu = await upsertMenu({ name: 'Settings', route: '/admin/settings', icon: 'settings', parentId: globalAdministration.id, displayOrder: 9 });
  await grant(settingsMenu.id, [globalAdminRole?.id]);
  const emailLogsMenu = await upsertMenu({ name: 'Email Delivery Logs', route: '/admin/email-logs', icon: 'mail-check', parentId: globalAdministration.id, displayOrder: 10 });
  await grant(emailLogsMenu.id, [globalAdminRole?.id]);
  await db.delete(menus).where(eq(menus.route, '/admin/user-settings'));

  const organisationProjectsMenu = await upsertMenu({ name: 'Organisation Projects', route: '/org/projects', icon: 'folder-cog', parentId: administration.id, displayOrder: 1 });
  await grant(organisationProjectsMenu.id, [globalAdminRole?.id, orgAdminRole?.id]);
  const membersMenu = await upsertMenu({ name: 'Organisation Members', route: '/org/members', icon: 'users-round', parentId: administration.id, displayOrder: 2 });
  await grant(membersMenu.id, [globalAdminRole?.id, orgAdminRole?.id]);
  const teamsMenu = await upsertMenu({ name: 'Organisation Teams', route: '/org/teams', icon: 'waypoints', parentId: administration.id, displayOrder: 3 });
  await grant(teamsMenu.id, [globalAdminRole?.id, orgAdminRole?.id]);

  if (orgAdminRole) {
    await db
      .delete(rolesMenus)
      .where(
        and(
          eq(rolesMenus.roleId, orgAdminRole.id),
          inArray(rolesMenus.menuId, [globalAdministration.id, sessionsMenu.id]),
        ),
      );
  }

  // --- Application settings (single row, default org = McDermott IT) ---
  const existingSettings = await db.select().from(appSettings).limit(1);
  if (existingSettings.length === 0) {
    await db.insert(appSettings).values({ defaultOrgId: globalOrg.id });
  } else {
    await db
      .update(appSettings)
      .set({ defaultOrgId: globalOrg.id, updatedAt: new Date() })
      .where(eq(appSettings.id, existingSettings[0].id));
  }

  console.log('Seed complete.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
