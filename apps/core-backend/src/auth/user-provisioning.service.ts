import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { CORE_DB } from '../db/database.module';
import type { CoreDb } from '../db';
import { roles, userRoles, users } from '../db/schema';
import { UsersService } from '../users/users.service';
import { AuthUser } from './auth-user.interface';
import { B2cClaims } from './b2c-token.service';

// Just-in-time provisioning: maps a verified B2C identity to a local user row.
@Injectable()
export class UserProvisioningService {
  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly usersService: UsersService,
  ) {}

  private async globalRoleNames(userId: string): Promise<string[]> {
    const rows = await this.db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.userId, userId), isNull(userRoles.orgId)));
    return rows.map((r) => r.name);
  }

  // Resolves an already-provisioned user by id (used for local JWT sessions).
  async resolveById(userId: string): Promise<AuthUser> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new Error('User not found');
    return {
      id: user.id,
      b2cOid: user.b2cOid ?? '',
      email: user.email,
      displayName: user.displayName,
      globalRoles: await this.globalRoleNames(user.id),
    };
  }

  async resolve(claims: B2cClaims): Promise<AuthUser> {
    const oid = claims.oid ?? claims.sub;
    const email = claims.emails?.[0] ?? claims.email ?? '';
    const displayName =
      claims.name ?? [claims.given_name, claims.family_name].filter(Boolean).join(' ') ?? email;

    let [user] = await this.db.select().from(users).where(eq(users.b2cOid, oid));
    if (!user && email) {
      // Link a pre-seeded user (e.g. Admin) on first login by email.
      [user] = await this.db.select().from(users).where(eq(users.email, email));
      if (user) {
        [user] = await this.db
          .update(users)
          .set({ b2cOid: oid, updatedAt: new Date() })
          .where(eq(users.id, user.id))
          .returning();
      }
    }
    if (!user) {
      [user] = await this.db
        .insert(users)
        .values({ b2cOid: oid, email, displayName, status: 'active' })
        .returning();
      // New B2C signups default into McDermott IT.
      await this.usersService.ensureDefaultMembership(user.id);
    }

    const globalRoles = await this.db
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.userId, user.id), isNull(userRoles.orgId)));

    // Throttled inside the service so this per-request path stays cheap.
    await this.usersService.touchLastSignedIn(user.id);

    return {
      id: user.id,
      b2cOid: oid,
      email: user.email,
      displayName: user.displayName,
      globalRoles: globalRoles.map((r) => r.name),
    };
  }
}
