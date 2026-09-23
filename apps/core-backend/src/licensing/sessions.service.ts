import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { CORE_DB } from '../db/database.module';
import type { CoreDb } from '../db';
import {
  organisationModules,
  organisationTeamUsers,
  organisationUserProjects,
  organisations,
  organisationUsers,
  products,
  projectModules,
  projects,
  roles,
  sessions,
  userRoles,
  users,
} from '../db/schema';
import { SettingsService } from '../settings/settings.service';
import type { AuthUser } from '../auth/auth-user.interface';

@Injectable()
export class SessionsService {
  private readonly fallbackWindowSeconds: number;

  constructor(
    @Inject(CORE_DB) private readonly db: CoreDb,
    config: ConfigService,
    private readonly settings: SettingsService,
  ) {
    this.fallbackWindowSeconds = Number(config.get('SESSION_HEARTBEAT_WINDOW_SECONDS') ?? 120);
  }

  // Idle window driven by the admin session-timeout setting (env as fallback).
  private async activeWindow(): Promise<Date> {
    const seconds = await this.settings.getSessionTimeoutSeconds(this.fallbackWindowSeconds);
    return new Date(Date.now() - seconds * 1000);
  }

  // Opens a session for a module under an org, enforcing the concurrent seat cap.
  async open(params: {
    userId: string;
    orgId: string;
    productId: string;
    projectId?: string;
    ip?: string;
    userAgent?: string;
  }) {
    const window = await this.activeWindow();
    return this.db.transaction(async (tx) => {
      const [license] = await tx
        .select()
        .from(organisationModules)
        .where(
          and(
            eq(organisationModules.orgId, params.orgId),
            eq(organisationModules.productId, params.productId),
            eq(organisationModules.status, 'active'),
          ),
        )
        .for('update');
      if (!license) {
        throw new NotFoundException('Organisation is not licensed for this module');
      }

      const [membership] = await tx
        .select({ membership: organisationUsers.membership })
        .from(organisationUsers)
        .where(
          and(
            eq(organisationUsers.userId, params.userId),
            eq(organisationUsers.orgId, params.orgId),
            eq(organisationUsers.status, 'active'),
          ),
        );
      if (!membership) throw new ForbiddenException('User is not an active organisation member');

      if (!['Owner', 'Admin'].includes(membership.membership)) {
        const [productAccess] = await tx
          .select({ userId: userRoles.userId })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id))
          .where(
            and(
              eq(userRoles.userId, params.userId),
              or(isNull(userRoles.orgId), eq(userRoles.orgId, params.orgId)),
              or(eq(roles.name, 'Global Administrator'), eq(roles.productId, params.productId)),
            ),
          );
        if (!productAccess) throw new ForbiddenException('User is not assigned to this module');
      }

      if (license.teamId) {
        const [teamMembership] = await tx
          .select({ userId: organisationTeamUsers.userId })
          .from(organisationTeamUsers)
          .where(
            and(
              eq(organisationTeamUsers.teamId, license.teamId),
              eq(organisationTeamUsers.userId, params.userId),
            ),
          );
        if (!teamMembership) {
          throw new ForbiddenException('This module is restricted to an assigned organisation team');
        }
      }

      const allocations = await tx
        .select({ projectId: projectModules.projectId, allocatedSeats: projectModules.allocatedSeats })
        .from(projectModules)
        .where(eq(projectModules.organisationModuleId, license.id));
      let seatLimit = license.licensedSeats;
      let effectiveProjectId: string | undefined;
      if (allocations.length > 0) {
        if (!params.projectId) {
          throw new BadRequestException('Project selection is required for this module');
        }
        const allocation = allocations.find((row) => row.projectId === params.projectId);
        if (!allocation) {
          throw new ForbiddenException('This module is not allocated to the selected project');
        }
        const [projectAccess] = await tx
          .select({ projectId: organisationUserProjects.projectId })
          .from(organisationUserProjects)
          .where(
            and(
              eq(organisationUserProjects.orgId, params.orgId),
              eq(organisationUserProjects.userId, params.userId),
              eq(organisationUserProjects.projectId, params.projectId),
            ),
          );
        if (!projectAccess) throw new ForbiddenException('User is not assigned to the selected project');
        seatLimit = allocation.allocatedSeats;
        effectiveProjectId = params.projectId;
      }

      const projectCondition = effectiveProjectId
        ? eq(sessions.projectId, effectiveProjectId)
        : isNull(sessions.projectId);

      const [existing] = await tx
        .select()
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, params.userId),
            eq(sessions.orgId, params.orgId),
            eq(sessions.productId, params.productId),
            projectCondition,
            isNull(sessions.endedAt),
            gte(sessions.lastSeenAt, window),
          ),
        );
      if (existing) {
        const [updated] = await tx
          .update(sessions)
          .set({ lastSeenAt: new Date() })
          .where(eq(sessions.id, existing.id))
          .returning();
        return updated;
      }

      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(sessions)
        .where(
          and(
            eq(sessions.orgId, params.orgId),
            eq(sessions.productId, params.productId),
            projectCondition,
            isNull(sessions.endedAt),
            gte(sessions.lastSeenAt, window),
          ),
        );

      if (count >= seatLimit) {
        throw new ForbiddenException(
          `Concurrent seat limit reached (${seatLimit}) for this module`,
        );
      }

      const [created] = await tx
        .insert(sessions)
        .values({
          userId: params.userId,
          orgId: params.orgId,
          productId: params.productId,
          projectId: effectiveProjectId ?? null,
          ip: params.ip,
          userAgent: params.userAgent,
        })
        .returning();
      return created;
    });
  }

  async openAdministration(params: {
    userId: string;
    orgId: string;
    ip?: string;
    userAgent?: string;
  }) {
    const window = await this.activeWindow();
    const [membership] = await this.db
      .select({ userId: organisationUsers.userId })
      .from(organisationUsers)
      .where(
        and(
          eq(organisationUsers.userId, params.userId),
          eq(organisationUsers.orgId, params.orgId),
          eq(organisationUsers.status, 'active'),
        ),
      );
    if (!membership) throw new ForbiddenException('User is not an active organisation member');

    const [existing] = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, params.userId),
          eq(sessions.orgId, params.orgId),
          isNull(sessions.productId),
          isNull(sessions.projectId),
          isNull(sessions.endedAt),
          gte(sessions.lastSeenAt, window),
        ),
      );
    if (existing) {
      const [updated] = await this.db
        .update(sessions)
        .set({ lastSeenAt: new Date() })
        .where(eq(sessions.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await this.db
      .insert(sessions)
      .values({
        userId: params.userId,
        orgId: params.orgId,
        productId: null,
        projectId: null,
        ip: params.ip,
        userAgent: params.userAgent,
      })
      .returning();
    return created;
  }

  async heartbeat(sessionId: string, userId: string) {
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId), isNull(sessions.endedAt)));
    if (!session) throw new NotFoundException('Session not found or already closed');

    const [membership] = await this.db
      .select({ userId: organisationUsers.userId })
      .from(organisationUsers)
      .where(
        and(
          eq(organisationUsers.orgId, session.orgId),
          eq(organisationUsers.userId, userId),
          eq(organisationUsers.status, 'active'),
        ),
      );
    let accessAllowed = !!membership;
    if (accessAllowed && session.productId) {
      const [license] = await this.db
        .select({ id: organisationModules.id, teamId: organisationModules.teamId })
        .from(organisationModules)
        .where(
          and(
            eq(organisationModules.orgId, session.orgId),
            eq(organisationModules.productId, session.productId),
            eq(organisationModules.status, 'active'),
          ),
        );
      accessAllowed = !!license;
      if (license?.teamId) {
        const [teamMembership] = await this.db
          .select({ userId: organisationTeamUsers.userId })
          .from(organisationTeamUsers)
          .where(
            and(
              eq(organisationTeamUsers.teamId, license.teamId),
              eq(organisationTeamUsers.userId, userId),
            ),
          );
        accessAllowed = !!teamMembership;
      }
      if (accessAllowed && session.projectId) {
        const [[projectAccess], [projectAllocation]] = await Promise.all([
          this.db
            .select({ projectId: organisationUserProjects.projectId })
            .from(organisationUserProjects)
            .where(
              and(
                eq(organisationUserProjects.orgId, session.orgId),
                eq(organisationUserProjects.userId, userId),
                eq(organisationUserProjects.projectId, session.projectId),
              ),
            ),
          this.db
            .select({ projectId: projectModules.projectId })
            .from(projectModules)
            .where(
              and(
                eq(projectModules.organisationModuleId, license!.id),
                eq(projectModules.projectId, session.projectId),
              ),
            ),
        ]);
        accessAllowed = !!projectAccess && !!projectAllocation;
      }
    }
    if (!accessAllowed) {
      await this.db.update(sessions).set({ endedAt: new Date() }).where(eq(sessions.id, sessionId));
      throw new ForbiddenException('Session access has been revoked');
    }

    const [updated] = await this.db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(sessions.userId, userId),
          isNull(sessions.endedAt),
        ),
      )
      .returning();
    if (!updated) throw new NotFoundException('Session not found or already closed');
    return updated;
  }

  async close(sessionId: string, userId: string) {
    await this.db
      .update(sessions)
      .set({ endedAt: new Date() })
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  }

  async listRunning(orgId: string, user: AuthUser) {
    const [organisation] = await this.db
      .select({ id: organisations.id })
      .from(organisations)
      .where(eq(organisations.id, orgId));
    if (!organisation) throw new NotFoundException('Organisation not found');

    if (!user.globalRoles.includes('Global Administrator')) {
      const [membership] = await this.db
        .select({ membership: organisationUsers.membership })
        .from(organisationUsers)
        .where(
          and(
            eq(organisationUsers.orgId, orgId),
            eq(organisationUsers.userId, user.id),
            eq(organisationUsers.status, 'active'),
          ),
        );
      if (!membership || !['Owner', 'Admin'].includes(membership.membership)) {
        throw new ForbiddenException('Organisation administrator access required');
      }
    }

    return this.db
      .select({
        id: sessions.id,
        userId: users.id,
        userName: users.displayName,
        userEmail: users.email,
        orgId: organisations.id,
        orgName: organisations.name,
        productId: products.id,
        productCode: products.code,
        productName: products.name,
        projectId: projects.id,
        projectCode: projects.code,
        projectName: projects.name,
        startedAt: sessions.startedAt,
        lastSeenAt: sessions.lastSeenAt,
        ip: sessions.ip,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .innerJoin(organisations, eq(sessions.orgId, organisations.id))
      .leftJoin(products, eq(sessions.productId, products.id))
      .leftJoin(projects, eq(sessions.projectId, projects.id))
      .where(
        and(
          eq(sessions.orgId, orgId),
          isNull(sessions.endedAt),
          gte(sessions.lastSeenAt, await this.activeWindow()),
        ),
      )
      .orderBy(desc(sessions.lastSeenAt));
  }

  // Current concurrent usage vs. licensed seats for an org/product.
  async usage(orgId: string, productId: string) {
    const [license] = await this.db
      .select()
      .from(organisationModules)
      .where(
        and(eq(organisationModules.orgId, orgId), eq(organisationModules.productId, productId)),
      );
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(sessions)
      .where(
        and(
          eq(sessions.orgId, orgId),
          eq(sessions.productId, productId),
          isNull(sessions.endedAt),
          gte(sessions.lastSeenAt, await this.activeWindow()),
        ),
      );
    return { licensedSeats: license?.licensedSeats ?? 0, activeSessions: count };
  }

  // Closes sessions whose last heartbeat is older than the active window.
  async reapIdleSessions(): Promise<number> {
    const window = await this.activeWindow();
    const result = await this.db
      .update(sessions)
      .set({ endedAt: new Date() })
      .where(and(isNull(sessions.endedAt), sql`${sessions.lastSeenAt} < ${window}`))
      .returning({ id: sessions.id });
    return result.length;
  }
}
