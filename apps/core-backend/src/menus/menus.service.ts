import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';
import { CORE_DB } from '../db/database.module';
import type { CoreDb } from '../db';
import { Menu } from '../db/schema';
import { menus, organisationModules, organisationUsers, roles, rolesMenus, userRoles } from '../db/schema';
import type { AuthUser } from '../auth/auth-user.interface';

export interface MenuNode extends Menu {
  accessMode?: 'readonly' | 'editable';
  children: MenuNode[];
}

@Injectable()
export class MenusService {
  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  private buildTree(rows: (Menu & { accessMode?: 'readonly' | 'editable' })[]): MenuNode[] {
    const byId = new Map<string, MenuNode>();
    rows.forEach((m) => byId.set(m.id, { ...m, children: [] }));
    const roots: MenuNode[] = [];
    byId.forEach((node) => {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    const sort = (list: MenuNode[]) => {
      list.sort((a, b) => a.displayOrder - b.displayOrder);
      list.forEach((n) => sort(n.children));
    };
    sort(roots);
    return roots;
  }

  // Public (Global) menus available without authentication.
  async publicMenus(): Promise<MenuNode[]> {
    const rows = await this.db.select().from(menus).where(eq(menus.type, 'Global'));
    return this.buildTree(rows.filter((m) => m.isActive));
  }

  // Menus granted by global roles and roles scoped to the selected organisation.
  async menusForUser(user: AuthUser, orgId?: string): Promise<MenuNode[]> {
    const userRoleRows = await this.db
      .select({ roleId: userRoles.roleId, orgId: userRoles.orgId })
      .from(userRoles)
      .where(eq(userRoles.userId, user.id));
    const roleIds = new Set(userRoleRows
      .filter((role) => !role.orgId || role.orgId === orgId)
      .map((role) => role.roleId));

    let canManageOrganisation = user.globalRoles.includes('Global Administrator');
    if (!canManageOrganisation && orgId) {
      const [membership] = await this.db
        .select({ membership: organisationUsers.membership })
        .from(organisationUsers)
        .where(
          and(
            eq(organisationUsers.userId, user.id),
            eq(organisationUsers.orgId, orgId),
            eq(organisationUsers.status, 'active'),
          ),
        );
      canManageOrganisation = !!membership && ['Owner', 'Admin'].includes(membership.membership);
      if (canManageOrganisation) {
        const [organisationAdminRole] = await this.db
          .select({ id: roles.id })
          .from(roles)
          .where(eq(roles.name, 'Organisation Administrator'));
        if (organisationAdminRole) roleIds.add(organisationAdminRole.id);
      }
    }

    const accessByMenuId = new Map<string, 'readonly' | 'editable'>();
    if (roleIds.size > 0) {
      const grants = await this.db
        .select({ menuId: rolesMenus.menuId, accessMode: rolesMenus.accessMode })
        .from(rolesMenus)
        .where(inArray(rolesMenus.roleId, [...roleIds]));
      grants.forEach((grant) => {
        const current = accessByMenuId.get(grant.menuId);
        if (!current || grant.accessMode === 'editable') {
          accessByMenuId.set(grant.menuId, grant.accessMode);
        }
      });
    }

    const assignedProductIds = new Set<string>();
    if (orgId) {
      const now = new Date();
      const moduleRows = await this.db
        .select({ productId: organisationModules.productId })
        .from(organisationModules)
        .where(
          and(
            eq(organisationModules.orgId, orgId),
            eq(organisationModules.status, 'active'),
            lte(organisationModules.validFrom, now),
            or(isNull(organisationModules.validTo), gt(organisationModules.validTo, now)),
          ),
        );
      moduleRows.forEach(({ productId }) => assignedProductIds.add(productId));
    }

    const rows = await this.db.select().from(menus).where(eq(menus.isActive, true));
    const organisationAdminRoutes = new Set(['/org/members', '/admin/sessions']);
    const visible = rows.filter(
      (menu) =>
        accessByMenuId.has(menu.id) &&
        (!menu.productId || assignedProductIds.has(menu.productId)) &&
        (canManageOrganisation || !menu.route || !organisationAdminRoutes.has(menu.route)),
      ).map((menu) => ({ ...menu, accessMode: accessByMenuId.get(menu.id) }));
    return this.buildTree(visible);
  }

  async listAll(): Promise<Menu[]> {
    return this.db.select().from(menus);
  }

  async create(input: Partial<Menu> & { name: string }): Promise<Menu> {
    const [created] = await this.db
      .insert(menus)
      .values({
        name: input.name,
        route: input.route ?? null,
        icon: input.icon ?? null,
        type: input.type ?? 'Secured',
        parentId: input.parentId ?? null,
        productId: input.productId ?? null,
        displayOrder: input.displayOrder ?? 0,
        isActive: input.isActive ?? true,
      })
      .returning();
    return created;
  }

  async assignToRole(roleId: string, menuId: string) {
    await this.db.insert(rolesMenus).values({ roleId, menuId }).onConflictDoNothing();
  }

  async listRoles() {
    return this.db.select().from(roles);
  }
}
