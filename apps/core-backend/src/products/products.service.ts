import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, exists, gt, isNull, or } from 'drizzle-orm';
import { CORE_DB } from '../db/database.module';
import type { CoreDb } from '../db';
import { organisationModules, organisationTeamUsers, organisationUsers, productDbConnections, products } from '../db/schema';
import { encryptSecret } from '../common/crypto';
import type { AuthUser } from '../auth/auth-user.interface';

@Injectable()
export class ProductsService {
  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  async listProducts(user: AuthUser, orgId?: string) {
    if (!orgId) {
      if (!user.globalRoles.includes('Global Administrator')) {
        throw new ForbiddenException('Select an organisation to view available modules');
      }
      return this.db.select().from(products).where(eq(products.isActive, true));
    }

    if (!user.globalRoles.includes('Global Administrator')) {
      const [membership] = await this.db
        .select({ userId: organisationUsers.userId })
        .from(organisationUsers)
        .where(
          and(
            eq(organisationUsers.orgId, orgId),
            eq(organisationUsers.userId, user.id),
            eq(organisationUsers.status, 'active'),
          ),
        );
      if (!membership) throw new ForbiddenException('User is not an active organisation member');
    }

    return this.db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        description: products.description,
        isActive: products.isActive,
        createdAt: products.createdAt,
      })
      .from(organisationModules)
      .innerJoin(products, eq(organisationModules.productId, products.id))
      .where(
        and(
          eq(organisationModules.orgId, orgId),
          eq(organisationModules.status, 'active'),
          eq(products.isActive, true),
          or(isNull(organisationModules.validTo), gt(organisationModules.validTo, new Date())),
          or(
            isNull(organisationModules.teamId),
            exists(
              this.db
                .select({ userId: organisationTeamUsers.userId })
                .from(organisationTeamUsers)
                .where(
                  and(
                    eq(organisationTeamUsers.teamId, organisationModules.teamId),
                    eq(organisationTeamUsers.userId, user.id),
                  ),
                ),
            ),
          ),
        ),
      );
  }

  // Connection config with the secret redacted (never returned to clients).
  async getConnection(productId: string) {
    const [conn] = await this.db
      .select({
        id: productDbConnections.id,
        productId: productDbConnections.productId,
        host: productDbConnections.host,
        port: productDbConnections.port,
        database: productDbConnections.database,
        username: productDbConnections.username,
        ssl: productDbConnections.ssl,
        updatedAt: productDbConnections.updatedAt,
      })
      .from(productDbConnections)
      .where(eq(productDbConnections.productId, productId));
    return conn ?? null;
  }

  // Upsert a product DB connection; password is encrypted at rest.
  async upsertConnection(input: {
    productId: string;
    host: string;
    port: number;
    database: string;
    username: string;
    password: string;
    ssl: boolean;
    updatedBy: string;
  }) {
    const [product] = await this.db.select().from(products).where(eq(products.id, input.productId));
    if (!product) throw new NotFoundException('Product not found');

    const secretRef = encryptSecret(input.password);
    const [existing] = await this.db
      .select()
      .from(productDbConnections)
      .where(eq(productDbConnections.productId, input.productId));

    if (existing) {
      const [updated] = await this.db
        .update(productDbConnections)
        .set({
          host: input.host,
          port: input.port,
          database: input.database,
          username: input.username,
          secretRef,
          ssl: input.ssl,
          updatedBy: input.updatedBy,
          updatedAt: new Date(),
        })
        .where(eq(productDbConnections.id, existing.id))
        .returning();
      return this.redact(updated);
    }

    const [created] = await this.db
      .insert(productDbConnections)
      .values({
        productId: input.productId,
        host: input.host,
        port: input.port,
        database: input.database,
        username: input.username,
        secretRef,
        ssl: input.ssl,
        updatedBy: input.updatedBy,
      })
      .returning();
    return this.redact(created);
  }

  private redact(conn: typeof productDbConnections.$inferSelect) {
    const { secretRef: _secretRef, ...rest } = conn;
    return rest;
  }
}
