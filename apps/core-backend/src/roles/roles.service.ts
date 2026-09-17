import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { CORE_DB } from '../db/database.module';
import type { CoreDb } from '../db';
import { menus, products, roles, rolesMenus } from '../db/schema';

const SYSTEM_ROLE_NAMES = [
  'Global Administrator',
  'Organisation Administrator',
  'General User',
  'CreditGuard Requestor',
  'CreditGuard Reviewer',
] as const;

@Injectable()
export class RolesService {
  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  private isSystemRole(name: string) {
    return SYSTEM_ROLE_NAMES.includes(name as (typeof SYSTEM_ROLE_NAMES)[number]);
  }

  async list() {
    const rows = await this.db
      .select({
        id: roles.id,
        name: roles.name,
        scope: roles.scope,
        productId: roles.productId,
        productName: products.name,
        description: roles.description,
      })
      .from(roles)
      .leftJoin(products, eq(roles.productId, products.id));
    return rows
      .map((role) => ({ ...role, isSystem: this.isSystemRole(role.name) }))
      .sort((a, b) => Number(b.isSystem) - Number(a.isSystem) || a.name.localeCompare(b.name));
  }

  async listMenus(id: string) {
    await this.getRole(id);
    return this.db
      .select({
        id: menus.id,
        name: menus.name,
        route: menus.route,
        parentId: menus.parentId,
        productId: menus.productId,
        type: menus.type,
        displayOrder: menus.displayOrder,
        isActive: menus.isActive,
        accessMode: rolesMenus.accessMode,
      })
      .from(rolesMenus)
      .innerJoin(menus, eq(rolesMenus.menuId, menus.id))
      .where(and(eq(rolesMenus.roleId, id), eq(menus.type, 'Secured')))
      .orderBy(menus.displayOrder, menus.name);
  }

  async create(input: { name: string; productId: string; description?: string }) {
    const name = input.name.trim();
    await this.assertNameAvailable(name);
    await this.assertProductExists(input.productId);
    const [created] = await this.db
      .insert(roles)
      .values({ name, scope: 'global', productId: input.productId, description: input.description?.trim() || null })
      .returning();
    await this.syncModuleMenus(created.id, input.productId);
    return { ...created, productName: null, isSystem: false };
  }

  async update(id: string, input: { name: string; productId: string; description?: string }) {
    const existing = await this.getRole(id);
    this.assertMutable(existing.name);
    const name = input.name.trim();
    await this.assertNameAvailable(name, id);
    await this.assertProductExists(input.productId);
    const [updated] = await this.db
      .update(roles)
      .set({ name, scope: 'global', productId: input.productId, description: input.description?.trim() || null })
      .where(eq(roles.id, id))
      .returning();
    if (existing.productId !== input.productId) {
      await this.syncModuleMenus(id, input.productId);
    }
    return { ...updated, productName: null, isSystem: false };
  }

  async updateMenus(id: string, assignments: { menuId: string; accessMode: 'readonly' | 'editable' }[]) {
    await this.getRole(id);
    const menuIds = assignments.map(({ menuId }) => menuId);
    if (new Set(menuIds).size !== menuIds.length) {
      throw new BadRequestException('Screen menu assignments must be unique');
    }
    if (menuIds.length > 0) {
      const existingMenus = await this.db
        .select({ id: menus.id })
        .from(menus)
        .where(and(inArray(menus.id, menuIds), eq(menus.type, 'Secured')));
      if (existingMenus.length !== menuIds.length) {
        throw new BadRequestException('One or more screen menus do not exist or are public');
      }
    }
    await this.db.transaction(async (tx) => {
      await tx.delete(rolesMenus).where(eq(rolesMenus.roleId, id));
      if (assignments.length > 0) {
        await tx.insert(rolesMenus).values(assignments.map((assignment) => ({ roleId: id, ...assignment })));
      }
    });
    return this.listMenus(id);
  }

  async remove(id: string) {
    const existing = await this.getRole(id);
    this.assertMutable(existing.name);
    await this.db.delete(roles).where(eq(roles.id, id));
    return { ok: true };
  }

  private async syncModuleMenus(roleId: string, productId: string) {
    const moduleMenus = await this.db
      .select({ id: menus.id })
      .from(menus)
      .where(eq(menus.productId, productId));
    await this.db.transaction(async (tx) => {
      await tx.delete(rolesMenus).where(eq(rolesMenus.roleId, roleId));
      if (moduleMenus.length > 0) {
        await tx.insert(rolesMenus).values(moduleMenus.map(({ id: menuId }) => ({ roleId, menuId })));
      }
    });
  }

  private async assertProductExists(productId: string) {
    const [product] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, productId));
    if (!product) throw new NotFoundException('Module not found');
  }

  private async getRole(id: string) {
    const [role] = await this.db.select().from(roles).where(eq(roles.id, id));
    if (!role) throw new NotFoundException('Role not found');
    return role;
  }

  private assertMutable(name: string) {
    if (this.isSystemRole(name)) throw new ConflictException('System roles cannot be modified or deleted');
  }

  private async assertNameAvailable(name: string, exceptId?: string) {
    const [existing] = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, name));
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('Role name already exists');
    }
  }
}