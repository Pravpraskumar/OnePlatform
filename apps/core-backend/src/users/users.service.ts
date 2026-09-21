import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, ne } from 'drizzle-orm';
import { CORE_DB } from '../db/database.module';
import type { CoreDb } from '../db';
import { organisationModules, organisations, organisationTeams, organisationTeamUsers, organisationUserProjects, organisationUsers, products, projects, roles, sessions, userRoles, users } from '../db/schema';
import { SettingsService } from '../settings/settings.service';
import { hashPassword } from '../common/password';

export type EntityStatus = 'active' | 'suspended' | 'pending';

const DEFAULT_NOTIFICATION_PREFERENCES = {
  accessChanges: true,
  projectUpdates: true,
  sessionAlerts: true,
  platformAnnouncements: true,
  digest: 'daily' as const,
};

@Injectable()
export class UsersService {
  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    private readonly settings: SettingsService,
  ) {}

  // Assigns a user to the configured default organisation (falling back to
  // McDermott IT) and the General User role. Called for every new signup.
  async ensureDefaultMembership(userId: string): Promise<void> {
    let orgId = await this.settings.getDefaultOrgId();
    if (!orgId) {
      const [globalOrg] = await this.db
        .select()
        .from(organisations)
        .where(eq(organisations.slug, 'mcdermott-it'));
      orgId = globalOrg?.id ?? null;
    }
    if (orgId) {
      await this.db
        .insert(organisationUsers)
        .values({ orgId, userId, membership: 'Member', status: 'active' })
        .onConflictDoNothing();
    }

    const [generalRole] = await this.db.select().from(roles).where(eq(roles.name, 'General User'));
    if (generalRole) {
      const existing = await this.db
        .select()
        .from(userRoles)
        .where(
          and(
            eq(userRoles.userId, userId),
            eq(userRoles.roleId, generalRole.id),
            isNull(userRoles.orgId),
          ),
        );
      if (existing.length === 0) {
        await this.db.insert(userRoles).values({ userId, roleId: generalRole.id, orgId: null });
      }
    }
  }

  async create(input: {
    firstName: string;
    lastName: string;
    email: string;
    username: string;
    status: EntityStatus;
    password: string;
  }) {
    const email = input.email.toLowerCase().trim();
    const username = input.username.toLowerCase().trim();
    const [emailOwner] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (emailOwner) throw new ConflictException('That email address is already in use');
    const [usernameOwner] = await this.db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (usernameOwner) throw new ConflictException('That username is already in use');

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    try {
      const [created] = await this.db
        .insert(users)
        .values({
          firstName,
          lastName,
          displayName: `${firstName} ${lastName}`.trim(),
          email,
          username,
          passwordHash: await hashPassword(input.password),
          status: input.status,
        })
        .returning({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          displayName: users.displayName,
          email: users.email,
          username: users.username,
          status: users.status,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        });
      await this.ensureDefaultMembership(created.id);
      return { ...created, hasPassword: true, isB2c: false, lastSignedInAt: null, globalRoles: [], roleAssignments: [], organisations: [] };
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('That email address or username is already in use');
      }
      throw error;
    }
  }

  // All users with their global roles and organisation memberships (admin view).
  async listAll() {
    const allUsers = await this.db.select().from(users);

    const roleRows = await this.db
      .select({
        userId: userRoles.userId,
        roleName: roles.name,
        scope: roles.scope,
        productName: products.name,
        orgId: userRoles.orgId,
        orgName: organisations.name,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .leftJoin(products, eq(roles.productId, products.id))
      .leftJoin(organisations, eq(userRoles.orgId, organisations.id));

    const orgRows = await this.db
      .select({
        userId: organisationUsers.userId,
        orgId: organisations.id,
        orgName: organisations.name,
        membership: organisationUsers.membership,
      })
      .from(organisationUsers)
      .innerJoin(organisations, eq(organisationUsers.orgId, organisations.id));

    return allUsers.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      firstName: u.firstName ?? u.displayName.trim().split(/\s+/)[0] ?? '',
      lastName: u.lastName ?? u.displayName.trim().split(/\s+/).slice(1).join(' '),
      username: u.username ?? u.email.split('@')[0],
      status: u.status,
      hasPassword: !!u.passwordHash,
      isB2c: !!u.b2cOid,
      lastSignedInAt: u.lastSignedInAt,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      globalRoles: roleRows
        .filter((r) => r.userId === u.id && r.scope === 'global' && !r.orgId)
        .map((r) => r.roleName),
      roleAssignments: roleRows
        .filter((r) => r.userId === u.id)
        .map((r) => ({
          name: r.roleName,
          scope: r.scope,
          productName: r.productName,
          orgId: r.orgId,
          orgName: r.orgName,
        })),
      organisations: orgRows
        .filter((o) => o.userId === u.id)
        .map((o) => ({ id: o.orgId, name: o.orgName, membership: o.membership })),
    }));
  }

  async getUserSettings(userId: string) {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) throw new NotFoundException('User not found');

    const [roleRows, membershipRows, moduleRows, projectRows, teamRows, sessionRows] = await Promise.all([
      this.db
        .select({ name: roles.name, scope: roles.scope, productName: products.name, orgId: userRoles.orgId, orgName: organisations.name })
        .from(userRoles)
        .innerJoin(roles, eq(userRoles.roleId, roles.id))
        .leftJoin(products, eq(roles.productId, products.id))
        .leftJoin(organisations, eq(userRoles.orgId, organisations.id))
        .where(eq(userRoles.userId, userId)),
      this.db
        .select({ id: organisations.id, name: organisations.name, membership: organisationUsers.membership, status: organisationUsers.status })
        .from(organisationUsers)
        .innerJoin(organisations, eq(organisationUsers.orgId, organisations.id))
        .where(eq(organisationUsers.userId, userId)),
      this.db
        .select({ id: products.id, name: products.name, code: products.code, orgId: organisations.id, orgName: organisations.name, teamId: organisationModules.teamId, teamUserId: organisationTeamUsers.userId })
        .from(organisationModules)
        .innerJoin(products, eq(organisationModules.productId, products.id))
        .innerJoin(organisations, eq(organisationModules.orgId, organisations.id))
        .leftJoin(
          organisationTeamUsers,
          and(eq(organisationTeamUsers.teamId, organisationModules.teamId), eq(organisationTeamUsers.userId, userId)),
        )
        .where(and(eq(organisationModules.status, 'active'), eq(products.isActive, true))),
      this.db
        .select({ id: projects.id, code: projects.code, name: projects.name, orgId: organisations.id, orgName: organisations.name })
        .from(organisationUserProjects)
        .innerJoin(projects, eq(organisationUserProjects.projectId, projects.id))
        .innerJoin(organisations, eq(organisationUserProjects.orgId, organisations.id))
        .where(eq(organisationUserProjects.userId, userId)),
      this.db
        .select({ id: organisationTeams.id, name: organisationTeams.name, orgId: organisations.id, orgName: organisations.name })
        .from(organisationTeamUsers)
        .innerJoin(organisationTeams, eq(organisationTeamUsers.teamId, organisationTeams.id))
        .innerJoin(organisations, eq(organisationTeams.orgId, organisations.id))
        .where(eq(organisationTeamUsers.userId, userId)),
      this.db
        .select({ id: sessions.id, orgName: organisations.name, productName: products.name, projectName: projects.name, startedAt: sessions.startedAt, lastSeenAt: sessions.lastSeenAt, endedAt: sessions.endedAt, ip: sessions.ip })
        .from(sessions)
        .innerJoin(organisations, eq(sessions.orgId, organisations.id))
        .leftJoin(products, eq(sessions.productId, products.id))
        .leftJoin(projects, eq(sessions.projectId, projects.id))
        .where(eq(sessions.userId, userId))
        .orderBy(desc(sessions.lastSeenAt))
        .limit(10),
    ]);

    const membershipOrgIds = new Set(membershipRows.filter((membership) => membership.status === 'active').map((membership) => membership.id));
    const effectiveModules = moduleRows
      .filter((module) => membershipOrgIds.has(module.orgId) && (!module.teamId || module.teamUserId === userId))
      .map(({ teamUserId: _teamUserId, ...module }) => module);

    return {
      profile: {
        id: user.id,
        firstName: user.firstName ?? '',
        lastName: user.lastName ?? '',
        displayName: user.displayName,
        email: user.email,
        username: user.username ?? '',
        status: user.status,
        source: user.b2cOid ? 'Microsoft' : user.passwordHash ? 'Local' : 'No login',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastSignedInAt: user.lastSignedInAt,
      },
      notifications: user.notificationPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES,
      access: { organisations: membershipRows, roles: roleRows, modules: effectiveModules, projects: projectRows, teams: teamRows },
      sessions: sessionRows,
    };
  }

  async updateNotificationPreferences(
    userId: string,
    preferences: {
      accessChanges: boolean;
      projectUpdates: boolean;
      sessionAlerts: boolean;
      platformAnnouncements: boolean;
      digest: 'instant' | 'daily' | 'weekly' | 'off';
    },
  ) {
    const [updated] = await this.db
      .update(users)
      .set({ notificationPreferences: preferences, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ notificationPreferences: users.notificationPreferences });
    if (!updated) throw new NotFoundException('User not found');
    return updated.notificationPreferences;
  }

  // Records a sign-in, throttled so per-request auth checks don't write every time.
  async touchLastSignedIn(userId: string): Promise<void> {
    const [row] = await this.db
      .select({ last: users.lastSignedInAt })
      .from(users)
      .where(eq(users.id, userId));
    if (!row) return;
    const stale = !row.last || Date.now() - new Date(row.last).getTime() > 5 * 60 * 1000;
    if (stale) {
      await this.db.update(users).set({ lastSignedInAt: new Date() }).where(eq(users.id, userId));
    }
  }

  async updateStatus(userId: string, status: EntityStatus) {
    const [updated] = await this.db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    if (!updated) throw new NotFoundException('User not found');
    return { id: updated.id, status: updated.status };
  }

  async bulkUpdateStatus(userIds: string[], status: EntityStatus) {
    const uniqueIds = [...new Set(userIds)];
    const updated = await this.db
      .update(users)
      .set({ status, updatedAt: new Date() })
      .where(inArray(users.id, uniqueIds))
      .returning({ id: users.id, status: users.status });
    if (updated.length !== uniqueIds.length) throw new NotFoundException('One or more users were not found');
    return updated;
  }

  async update(
    userId: string,
    input: {
      firstName: string;
      lastName: string;
      email: string;
      username: string;
      status: EntityStatus;
    },
  ) {
    const [existing] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, userId));
    if (!existing) throw new NotFoundException('User not found');

    const email = input.email.toLowerCase().trim();
    const username = input.username.toLowerCase().trim();
    const [emailOwner] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, email), ne(users.id, userId)));
    if (emailOwner) throw new ConflictException('That email address is already in use');
    const [usernameOwner] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), ne(users.id, userId)));
    if (usernameOwner) throw new ConflictException('That username is already in use');

    const firstName = input.firstName.trim();
    const lastName = input.lastName.trim();
    const [updated] = await this.db
      .update(users)
      .set({
        firstName,
        lastName,
        displayName: `${firstName} ${lastName}`.trim(),
        email,
        username,
        status: input.status,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning();
    return updated;
  }

  async assignRole(userId: string, roleName: string, orgId?: string) {
    const [role] = await this.db.select().from(roles).where(eq(roles.name, roleName));
    if (!role) throw new NotFoundException('Role not found');
    if (role.scope === 'org') {
      if (!orgId) throw new BadRequestException('Organisation is required for this role');
      const [membership] = await this.db
        .select({ membership: organisationUsers.membership })
        .from(organisationUsers)
        .where(and(eq(organisationUsers.userId, userId), eq(organisationUsers.orgId, orgId)));
      if (!membership) throw new BadRequestException('User is not a member of this organisation');
      await this.db
        .insert(userRoles)
        .values({ userId, roleId: role.id, orgId })
        .onConflictDoNothing();
      if (role.name === 'Organisation Administrator' && membership.membership === 'Member') {
        await this.db
          .update(organisationUsers)
          .set({ membership: 'Admin' })
          .where(and(eq(organisationUsers.userId, userId), eq(organisationUsers.orgId, orgId)));
      }
      return { ok: true };
    }

    const existing = await this.db
      .select({ id: userRoles.id })
      .from(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id), isNull(userRoles.orgId)));
    if (existing.length > 0) return { ok: true };
    await this.db
      .insert(userRoles)
      .values({ userId, roleId: role.id, orgId: null })
      .execute();
    return { ok: true };
  }

  async removeRole(userId: string, roleName: string, orgId?: string) {
    const [role] = await this.db.select().from(roles).where(eq(roles.name, roleName));
    if (!role) throw new NotFoundException('Role not found');
    if (role.scope === 'org' && !orgId) {
      throw new BadRequestException('Organisation is required for this role');
    }
    await this.db
      .delete(userRoles)
      .where(
        role.scope === 'org'
          ? and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id), eq(userRoles.orgId, orgId!))
          : and(eq(userRoles.userId, userId), eq(userRoles.roleId, role.id), isNull(userRoles.orgId)),
      );
    if (role.name === 'Organisation Administrator' && orgId) {
      await this.db
        .update(organisationUsers)
        .set({ membership: 'Member' })
        .where(
          and(
            eq(organisationUsers.userId, userId),
            eq(organisationUsers.orgId, orgId),
            eq(organisationUsers.membership, 'Admin'),
          ),
        );
    }
    return { ok: true };
  }

  listRoles() {
    return this.db
      .select({
        id: roles.id,
        name: roles.name,
        scope: roles.scope,
        productId: roles.productId,
        productName: products.name,
      })
      .from(roles)
      .leftJoin(products, eq(roles.productId, products.id));
  }
}
