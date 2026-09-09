import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { CORE_DB } from '../db/database.module';
import type { CoreDb } from '../db';
import { organisationModules, organisations, organisationTeams, organisationTeamUsers, organisationUserProjects, organisationUsers, products, projectModules, projects, userModuleProjects, users } from '../db/schema';
import type { AuthUser } from '../auth/auth-user.interface';

export type EntityStatus = 'active' | 'suspended' | 'pending';

@Injectable()
export class OrganisationsService {
  constructor(@Inject(CORE_DB) private readonly db: CoreDb) {}

  // Header session selector: every user sees only their active organisation memberships.
  async listForUser(user: AuthUser) {
    return this.db
      .select({
        id: organisations.id,
        name: organisations.name,
        slug: organisations.slug,
        status: organisations.status,
        membership: organisationUsers.membership,
      })
      .from(organisationUsers)
      .innerJoin(organisations, eq(organisationUsers.orgId, organisations.id))
      .where(
        and(
          eq(organisationUsers.userId, user.id),
          eq(organisationUsers.status, 'active'),
          eq(organisations.status, 'active'),
        ),
      );
  }

  // All organisations with member and module counts (admin management view).
  async listAll() {
    const orgs = await this.db.select().from(organisations);
    const memberCounts = await this.db
      .select({ orgId: organisationUsers.orgId, count: sql<number>`count(*)::int` })
      .from(organisationUsers)
      .groupBy(organisationUsers.orgId);
    const moduleCounts = await this.db
      .select({ orgId: organisationModules.orgId, count: sql<number>`count(*)::int` })
      .from(organisationModules)
      .groupBy(organisationModules.orgId);

    return orgs.map((o) => ({
      ...o,
      memberCount: memberCounts.find((m) => m.orgId === o.id)?.count ?? 0,
      moduleCount: moduleCounts.find((m) => m.orgId === o.id)?.count ?? 0,
    }));
  }

  private async assertSlugFree(slug: string, exceptId?: string) {
    const conflict = await this.db
      .select({ id: organisations.id })
      .from(organisations)
      .where(
        exceptId
          ? and(eq(organisations.slug, slug), ne(organisations.id, exceptId))
          : eq(organisations.slug, slug),
      );
    if (conflict.length > 0) throw new ConflictException('An organisation with this slug already exists');
  }

  async create(input: { name: string; slug: string; ownerUserId: string }) {
    await this.assertSlugFree(input.slug);
    const [org] = await this.db
      .insert(organisations)
      .values({ name: input.name, slug: input.slug, ownerUserId: input.ownerUserId })
      .returning();
    await this.db
      .insert(organisationUsers)
      .values({ orgId: org.id, userId: input.ownerUserId, membership: 'Owner' })
      .onConflictDoNothing();
    return org;
  }

  async update(id: string, input: { name?: string; slug?: string }) {
    const [existing] = await this.db.select().from(organisations).where(eq(organisations.id, id));
    if (!existing) throw new NotFoundException('Organisation not found');
    if (input.slug && input.slug !== existing.slug) await this.assertSlugFree(input.slug, id);

    const [updated] = await this.db
      .update(organisations)
      .set({
        name: input.name ?? existing.name,
        slug: input.slug ?? existing.slug,
      })
      .where(eq(organisations.id, id))
      .returning();
    return updated;
  }

  // Deactivate/reactivate an organisation (the Global org cannot be suspended).
  async setStatus(id: string, status: EntityStatus) {
    const [existing] = await this.db.select().from(organisations).where(eq(organisations.id, id));
    if (!existing) throw new NotFoundException('Organisation not found');
    if (existing.slug === 'global' && status !== 'active') {
      throw new ConflictException('The Global organisation cannot be deactivated');
    }
    const [updated] = await this.db
      .update(organisations)
      .set({ status })
      .where(eq(organisations.id, id))
      .returning();
    return { id: updated.id, status: updated.status };
  }


  // Modules licensed to an org, with seat counts (for Org/Global admin screens).
  async listModules(orgId: string) {
    return this.db
      .select({
        id: organisationModules.id,
        productId: products.id,
        productCode: products.code,
        productName: products.name,
        teamId: organisationModules.teamId,
        teamName: organisationTeams.name,
        licensedSeats: organisationModules.licensedSeats,
        status: organisationModules.status,
        validFrom: organisationModules.validFrom,
        validTo: organisationModules.validTo,
      })
      .from(organisationModules)
      .innerJoin(products, eq(organisationModules.productId, products.id))
      .leftJoin(organisationTeams, eq(organisationModules.teamId, organisationTeams.id))
      .where(eq(organisationModules.orgId, orgId));
  }

  async listTeams(orgId: string, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    const [teamRows, teamMemberRows, memberRows, moduleRows] = await Promise.all([
      this.db
        .select()
        .from(organisationTeams)
        .where(eq(organisationTeams.orgId, orgId))
        .orderBy(organisationTeams.name),
      this.db
        .select({ teamId: organisationTeamUsers.teamId, userId: organisationTeamUsers.userId })
        .from(organisationTeamUsers)
        .innerJoin(organisationTeams, eq(organisationTeamUsers.teamId, organisationTeams.id))
        .where(eq(organisationTeams.orgId, orgId)),
      this.db
        .select({ id: users.id, displayName: users.displayName, email: users.email, membership: organisationUsers.membership })
        .from(organisationUsers)
        .innerJoin(users, eq(organisationUsers.userId, users.id))
        .where(and(eq(organisationUsers.orgId, orgId), eq(organisationUsers.status, 'active')))
        .orderBy(users.displayName),
      this.listModules(orgId),
    ]);
    return {
      teams: teamRows.map((team) => ({
        ...team,
        memberIds: teamMemberRows.filter((row) => row.teamId === team.id).map((row) => row.userId),
      })),
      members: memberRows,
      modules: moduleRows,
    };
  }

  async createTeam(orgId: string, input: { name: string; description?: string }, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    const name = input.name.trim();
    const [existing] = await this.db
      .select({ id: organisationTeams.id })
      .from(organisationTeams)
      .where(and(eq(organisationTeams.orgId, orgId), eq(organisationTeams.name, name)));
    if (existing) throw new ConflictException('A team with this name already exists');
    const [created] = await this.db
      .insert(organisationTeams)
      .values({ orgId, name, description: input.description?.trim() || null })
      .returning();
    return created;
  }

  async updateTeam(orgId: string, teamId: string, input: { name: string; description?: string }, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    const name = input.name.trim();
    const [conflict] = await this.db
      .select({ id: organisationTeams.id })
      .from(organisationTeams)
      .where(and(eq(organisationTeams.orgId, orgId), eq(organisationTeams.name, name), ne(organisationTeams.id, teamId)));
    if (conflict) throw new ConflictException('A team with this name already exists');
    const [updated] = await this.db
      .update(organisationTeams)
      .set({ name, description: input.description?.trim() || null, updatedAt: new Date() })
      .where(and(eq(organisationTeams.id, teamId), eq(organisationTeams.orgId, orgId)))
      .returning();
    if (!updated) throw new NotFoundException('Organisation team not found');
    return updated;
  }

  async updateTeamMembers(orgId: string, teamId: string, userIds: string[], user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    const [team] = await this.db
      .select({ id: organisationTeams.id })
      .from(organisationTeams)
      .where(and(eq(organisationTeams.id, teamId), eq(organisationTeams.orgId, orgId)));
    if (!team) throw new NotFoundException('Organisation team not found');
    if (userIds.length > 0) {
      const validMembers = await this.db
        .select({ userId: organisationUsers.userId })
        .from(organisationUsers)
        .where(and(eq(organisationUsers.orgId, orgId), eq(organisationUsers.status, 'active'), inArray(organisationUsers.userId, userIds)));
      if (validMembers.length !== userIds.length) {
        throw new BadRequestException('Teams can contain only active organisation members');
      }
    }
    await this.db.transaction(async (tx) => {
      await tx.delete(organisationTeamUsers).where(eq(organisationTeamUsers.teamId, teamId));
      if (userIds.length > 0) {
        await tx.insert(organisationTeamUsers).values(userIds.map((userId) => ({ teamId, userId })));
      }
      await tx.update(organisationTeams).set({ updatedAt: new Date() }).where(eq(organisationTeams.id, teamId));
    });
    return { teamId, userIds };
  }

  async removeTeam(orgId: string, teamId: string, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    const [removed] = await this.db
      .delete(organisationTeams)
      .where(and(eq(organisationTeams.id, teamId), eq(organisationTeams.orgId, orgId)))
      .returning({ id: organisationTeams.id });
    if (!removed) throw new NotFoundException('Organisation team not found');
    return { ok: true };
  }

  async assignModuleTeam(orgId: string, productId: string, teamId: string | null, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    if (teamId) {
      const [team] = await this.db
        .select({ id: organisationTeams.id })
        .from(organisationTeams)
        .where(and(eq(organisationTeams.id, teamId), eq(organisationTeams.orgId, orgId)));
      if (!team) throw new NotFoundException('Organisation team not found');
    }
    const [updated] = await this.db
      .update(organisationModules)
      .set({ teamId })
      .where(and(eq(organisationModules.orgId, orgId), eq(organisationModules.productId, productId)))
      .returning();
    if (!updated) throw new NotFoundException('Organisation module assignment not found');
    return updated;
  }

  // Assign or update a module license (Global Administrator action).
  async assignModule(input: {
    orgId: string;
    productId: string;
    licensedSeats: number;
    validTo?: Date | null;
  }) {
    const [existing] = await this.db
      .select()
      .from(organisationModules)
      .where(
        and(
          eq(organisationModules.orgId, input.orgId),
          eq(organisationModules.productId, input.productId),
        ),
      );
    if (existing) {
      const [{ allocated }] = await this.db
        .select({ allocated: sql<number>`coalesce(sum(${projectModules.allocatedSeats}), 0)::int` })
        .from(projectModules)
        .where(eq(projectModules.organisationModuleId, existing.id));
      if (input.licensedSeats < allocated) {
        throw new ConflictException(
          `Licensed seats cannot be lower than ${allocated} seats allocated to projects`,
        );
      }
      const [updated] = await this.db
        .update(organisationModules)
        .set({ licensedSeats: input.licensedSeats, validTo: input.validTo ?? null, status: 'active' })
        .where(eq(organisationModules.id, existing.id))
        .returning();
      return updated;
    }
    const [created] = await this.db
      .insert(organisationModules)
      .values({
        orgId: input.orgId,
        productId: input.productId,
        licensedSeats: input.licensedSeats,
        validTo: input.validTo ?? null,
      })
      .returning();
    return created;
  }

  async removeModule(orgId: string, productId: string) {
    const [removed] = await this.db
      .delete(organisationModules)
      .where(
        and(
          eq(organisationModules.orgId, orgId),
          eq(organisationModules.productId, productId),
        ),
      )
      .returning({ id: organisationModules.id });
    if (!removed) throw new NotFoundException('Module assignment not found');
    return { ok: true };
  }

  private async assertActiveMember(orgId: string, user: AuthUser) {
    if (user.globalRoles.includes('Global Administrator')) return;
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
    if (!membership) throw new ForbiddenException('Active organisation membership required');
  }

  async listProjectModules(orgId: string, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    const [modules, projectRows, allocationRows] = await Promise.all([
      this.listModules(orgId),
      this.db
        .select({ id: projects.id, code: projects.code, name: projects.name })
        .from(projects)
        .where(and(eq(projects.orgId, orgId), eq(projects.status, 'active')))
        .orderBy(projects.code),
      this.db
        .select({
          id: projectModules.id,
          organisationModuleId: organisationModules.id,
          productId: organisationModules.productId,
          projectId: projects.id,
          projectCode: projects.code,
          projectName: projects.name,
          allocatedSeats: projectModules.allocatedSeats,
        })
        .from(projectModules)
        .innerJoin(organisationModules, eq(projectModules.organisationModuleId, organisationModules.id))
        .innerJoin(projects, eq(projectModules.projectId, projects.id))
        .where(eq(organisationModules.orgId, orgId)),
    ]);
    return { modules, projects: projectRows, allocations: allocationRows };
  }

  async assignProjectModule(
    orgId: string,
    input: { productId: string; projectId: string; allocatedSeats: number },
    user: AuthUser,
  ) {
    await this.assertCanManageTeam(orgId, user);
    return this.db.transaction(async (tx) => {
      const [license] = await tx
        .select()
        .from(organisationModules)
        .where(
          and(
            eq(organisationModules.orgId, orgId),
            eq(organisationModules.productId, input.productId),
            eq(organisationModules.status, 'active'),
          ),
        )
        .for('update');
      if (!license) throw new NotFoundException('Organisation module license not found');

      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, input.projectId),
            eq(projects.orgId, orgId),
            eq(projects.status, 'active'),
          ),
        );
      if (!project) throw new NotFoundException('Active project not found');

      const [existing] = await tx
        .select()
        .from(projectModules)
        .where(
          and(
            eq(projectModules.organisationModuleId, license.id),
            eq(projectModules.projectId, input.projectId),
          ),
        );
      const [{ allocated }] = await tx
        .select({ allocated: sql<number>`coalesce(sum(${projectModules.allocatedSeats}), 0)::int` })
        .from(projectModules)
        .where(eq(projectModules.organisationModuleId, license.id));
      const totalAfterSave = allocated - (existing?.allocatedSeats ?? 0) + input.allocatedSeats;
      if (totalAfterSave > license.licensedSeats) {
        throw new ConflictException(
          `Project allocations cannot exceed ${license.licensedSeats} licensed seats`,
        );
      }

      if (existing) {
        const [updated] = await tx
          .update(projectModules)
          .set({ allocatedSeats: input.allocatedSeats, updatedAt: new Date() })
          .where(eq(projectModules.id, existing.id))
          .returning();
        return updated;
      }
      const [created] = await tx
        .insert(projectModules)
        .values({
          organisationModuleId: license.id,
          projectId: input.projectId,
          allocatedSeats: input.allocatedSeats,
        })
        .returning();
      return created;
    });
  }

  async removeProjectModule(orgId: string, productId: string, projectId: string, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    const [license] = await this.db
      .select({ id: organisationModules.id })
      .from(organisationModules)
      .where(
        and(eq(organisationModules.orgId, orgId), eq(organisationModules.productId, productId)),
      );
    if (!license) throw new NotFoundException('Organisation module license not found');
    const [removed] = await this.db
      .delete(projectModules)
      .where(
        and(
          eq(projectModules.organisationModuleId, license.id),
          eq(projectModules.projectId, projectId),
        ),
      )
      .returning({ id: projectModules.id });
    if (!removed) throw new NotFoundException('Project module allocation not found');
    return { ok: true };
  }

  async listModuleProjects(orgId: string, productId: string, user: AuthUser) {
    await this.assertActiveMember(orgId, user);
    const [allocatedProjects, userProjectRows, [preference]] = await Promise.all([
      this.db
        .select({
          id: projects.id,
          code: projects.code,
          name: projects.name,
          allocatedSeats: projectModules.allocatedSeats,
        })
        .from(projectModules)
        .innerJoin(organisationModules, eq(projectModules.organisationModuleId, organisationModules.id))
        .innerJoin(projects, eq(projectModules.projectId, projects.id))
        .where(
          and(
            eq(organisationModules.orgId, orgId),
            eq(organisationModules.productId, productId),
            eq(projects.status, 'active'),
          ),
        )
        .orderBy(projects.code),
      this.db
        .select({ projectId: organisationUserProjects.projectId })
        .from(organisationUserProjects)
        .where(
          and(
            eq(organisationUserProjects.orgId, orgId),
            eq(organisationUserProjects.userId, user.id),
          ),
        ),
      this.db
        .select({ projectId: userModuleProjects.projectId })
        .from(userModuleProjects)
        .where(
          and(
            eq(userModuleProjects.userId, user.id),
            eq(userModuleProjects.orgId, orgId),
            eq(userModuleProjects.productId, productId),
          ),
        ),
    ]);
    const userProjectIds = new Set(userProjectRows.map((row) => row.projectId));
    const rows = allocatedProjects.filter((row) => userProjectIds.has(row.id));
    const lastProjectId = rows.some((row) => row.id === preference?.projectId)
      ? preference.projectId
      : null;
    return { projectRequired: allocatedProjects.length > 0, lastProjectId, projects: rows };
  }

  async setLastModuleProject(orgId: string, productId: string, projectId: string, user: AuthUser) {
    await this.assertActiveMember(orgId, user);
    const [allocation] = await this.db
      .select({ projectId: projectModules.projectId })
      .from(projectModules)
      .innerJoin(organisationModules, eq(projectModules.organisationModuleId, organisationModules.id))
      .innerJoin(projects, eq(projectModules.projectId, projects.id))
      .where(
        and(
          eq(organisationModules.orgId, orgId),
          eq(organisationModules.productId, productId),
          eq(projectModules.projectId, projectId),
          eq(projects.orgId, orgId),
          eq(projects.status, 'active'),
        ),
      );
    if (!allocation) throw new NotFoundException('Project is not allocated to this organisation module');

    const [projectAccess] = await this.db
      .select({ projectId: organisationUserProjects.projectId })
      .from(organisationUserProjects)
      .where(
        and(
          eq(organisationUserProjects.orgId, orgId),
          eq(organisationUserProjects.userId, user.id),
          eq(organisationUserProjects.projectId, projectId),
        ),
      );
    if (!projectAccess) throw new ForbiddenException('You are not assigned to this project');

    const [selection] = await this.db
      .insert(userModuleProjects)
      .values({ userId: user.id, orgId, productId, projectId })
      .onConflictDoUpdate({
        target: [userModuleProjects.userId, userModuleProjects.orgId, userModuleProjects.productId],
        set: { projectId, updatedAt: new Date() },
      })
      .returning();
    return selection;
  }

  private async assertCanManageTeam(orgId: string, user: AuthUser) {
    const [org] = await this.db.select().from(organisations).where(eq(organisations.id, orgId));
    if (!org) throw new NotFoundException('Organisation not found');
    if (user.globalRoles.includes('Global Administrator')) return;

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

  async listTeam(orgId: string, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    return this.db
      .select({
        userId: users.id,
        email: users.email,
        displayName: users.displayName,
        membership: organisationUsers.membership,
        status: organisationUsers.status,
        createdAt: organisationUsers.createdAt,
        updatedAt: organisationUsers.updatedAt,
      })
      .from(organisationUsers)
      .innerJoin(users, eq(organisationUsers.userId, users.id))
      .where(eq(organisationUsers.orgId, orgId));
  }

  async listMemberProjects(orgId: string, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    const [projectRows, assignmentRows] = await Promise.all([
      this.db
        .select({ id: projects.id, code: projects.code, name: projects.name })
        .from(projects)
        .where(and(eq(projects.orgId, orgId), eq(projects.status, 'active')))
        .orderBy(projects.code),
      this.db
        .select({ userId: organisationUserProjects.userId, projectId: organisationUserProjects.projectId })
        .from(organisationUserProjects)
        .where(eq(organisationUserProjects.orgId, orgId)),
    ]);
    return { projects: projectRows, assignments: assignmentRows };
  }

  async updateMemberProjects(orgId: string, userId: string, projectIds: string[], actor: AuthUser) {
    await this.assertCanManageTeam(orgId, actor);
    const [member] = await this.db
      .select({ userId: organisationUsers.userId })
      .from(organisationUsers)
      .where(
        and(
          eq(organisationUsers.orgId, orgId),
          eq(organisationUsers.userId, userId),
          eq(organisationUsers.status, 'active'),
        ),
      );
    if (!member) throw new NotFoundException('Active organisation member not found');

    if (projectIds.length > 0) {
      const validProjects = await this.db
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.orgId, orgId),
            eq(projects.status, 'active'),
            inArray(projects.id, projectIds),
          ),
        );
      if (validProjects.length !== projectIds.length) {
        throw new BadRequestException('Members can be assigned only to active organisation projects');
      }
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(organisationUserProjects)
        .where(
          and(
            eq(organisationUserProjects.orgId, orgId),
            eq(organisationUserProjects.userId, userId),
          ),
        );
      if (projectIds.length > 0) {
        await tx
          .insert(organisationUserProjects)
          .values(projectIds.map((projectId) => ({ orgId, userId, projectId })));
      }
    });
    return { userId, projectIds };
  }

  async listAvailableUsers(orgId: string, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    const [allUsers, existingMembers] = await Promise.all([
      this.db
        .select({ id: users.id, email: users.email, displayName: users.displayName })
        .from(users)
        .where(eq(users.status, 'active')),
      this.db
        .select({ userId: organisationUsers.userId })
        .from(organisationUsers)
        .where(eq(organisationUsers.orgId, orgId)),
    ]);
    const existingIds = new Set(existingMembers.map((member) => member.userId));
    return allUsers.filter((candidate) => !existingIds.has(candidate.id));
  }

  async addTeamMember(
    orgId: string,
    input: { email: string; membership: 'Admin' | 'Member' },
    actor: AuthUser,
  ) {
    await this.assertCanManageTeam(orgId, actor);
    const email = input.email.trim().toLowerCase();
    const [memberUser] = await this.db.select().from(users).where(eq(users.email, email));
    if (!memberUser) throw new NotFoundException('No platform user exists with this email');

    const [existing] = await this.db
      .select()
      .from(organisationUsers)
      .where(and(eq(organisationUsers.orgId, orgId), eq(organisationUsers.userId, memberUser.id)));
    if (existing?.membership === 'Owner') {
      throw new ConflictException('The organisation Owner membership cannot be changed');
    }
    if (existing) {
      await this.db
        .update(organisationUsers)
        .set({ membership: input.membership, status: 'active', updatedAt: new Date() })
        .where(and(eq(organisationUsers.orgId, orgId), eq(organisationUsers.userId, memberUser.id)));
    } else {
      await this.db
        .insert(organisationUsers)
        .values({ orgId, userId: memberUser.id, membership: input.membership, status: 'active' });
    }

    return { userId: memberUser.id, email, membership: input.membership };
  }

  async updateTeamMember(
    orgId: string,
    userId: string,
    input: { membership?: 'Admin' | 'Member'; status?: 'active' | 'suspended' },
    actor: AuthUser,
  ) {
    await this.assertCanManageTeam(orgId, actor);
    const [member] = await this.db
      .select({ membership: organisationUsers.membership })
      .from(organisationUsers)
      .where(and(eq(organisationUsers.orgId, orgId), eq(organisationUsers.userId, userId)));
    if (!member) throw new NotFoundException('Organisation member not found');
    if (member.membership === 'Owner') {
      throw new ConflictException('The organisation Owner assignment cannot be modified');
    }
    if (!input.membership && !input.status) {
      throw new BadRequestException('Membership or status is required');
    }

    const [updated] = await this.db
      .update(organisationUsers)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(organisationUsers.orgId, orgId), eq(organisationUsers.userId, userId)))
      .returning();
    return updated;
  }

  async removeTeamMember(orgId: string, userId: string, actor: AuthUser) {
    await this.assertCanManageTeam(orgId, actor);
    const [member] = await this.db
      .select({ membership: organisationUsers.membership })
      .from(organisationUsers)
      .where(and(eq(organisationUsers.orgId, orgId), eq(organisationUsers.userId, userId)));
    if (!member) throw new NotFoundException('Organisation member not found');
    if (member.membership === 'Owner') {
      throw new ConflictException('The organisation Owner assignment cannot be removed');
    }

    await this.db.transaction(async (tx) => {
      await tx
        .delete(organisationUserProjects)
        .where(
          and(
            eq(organisationUserProjects.orgId, orgId),
            eq(organisationUserProjects.userId, userId),
          ),
        );
      await tx
        .delete(organisationUsers)
        .where(and(eq(organisationUsers.orgId, orgId), eq(organisationUsers.userId, userId)));
    });
    return { ok: true };
  }
}
