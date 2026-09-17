import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { CORE_DB } from '../db/database.module';
import type { CoreDb } from '../db';
import { moduleUserDesignations, organisationModules, organisationProductIntegrations, organisations, organisationTeams, organisationTeamUsers, organisationUserProjects, organisationUsers, products, projectModules, projects, roles, userModuleProjects, userRoles, users } from '../db/schema';
import type { AuthUser } from '../auth/auth-user.interface';
import { decryptSecret, encryptSecret } from '../common/crypto';

export type EntityStatus = 'active' | 'suspended' | 'pending';

function signitApiEndpoint(baseUrl: string, path: string) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  return `${normalizedBaseUrl}${/\/api\/v2$/i.test(normalizedBaseUrl) ? '' : '/api/v2'}/${path}`;
}

@Injectable()
export class OrganisationsService {
  constructor(@Inject(CORE_DB) private readonly db: CoreDb, private readonly config: ConfigService) {}

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

  async listModuleUsers(orgId: string, productId: string, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    const [module] = await this.db
      .select({ teamId: organisationModules.teamId })
      .from(organisationModules)
      .where(and(
        eq(organisationModules.orgId, orgId),
        eq(organisationModules.productId, productId),
        eq(organisationModules.status, 'active'),
        or(isNull(organisationModules.validTo), gt(organisationModules.validTo, new Date())),
      ));
    if (!module) throw new NotFoundException('Active organisation module assignment not found');

    const memberRows = module.teamId
      ? await this.db
        .select({ id: users.id, displayName: users.displayName, email: users.email })
        .from(organisationTeamUsers)
        .innerJoin(users, eq(users.id, organisationTeamUsers.userId))
        .innerJoin(
          organisationUsers,
          and(
            eq(organisationUsers.userId, users.id),
            eq(organisationUsers.orgId, orgId),
            eq(organisationUsers.status, 'active'),
          ),
        )
        .where(eq(organisationTeamUsers.teamId, module.teamId))
      : await this.db
        .select({ id: users.id, displayName: users.displayName, email: users.email })
        .from(organisationUsers)
        .innerJoin(users, eq(users.id, organisationUsers.userId))
        .where(and(eq(organisationUsers.orgId, orgId), eq(organisationUsers.status, 'active')));

    const roleRows = memberRows.length > 0
      ? await this.db
        .select({ userId: userRoles.userId, role: roles.name })
        .from(userRoles)
        .innerJoin(roles, eq(roles.id, userRoles.roleId))
        .where(and(
          eq(roles.productId, productId),
          isNull(userRoles.orgId),
          inArray(userRoles.userId, memberRows.map(({ id }) => id)),
        ))
      : [];
    const rolesByUserId = new Map<string, string[]>();
    roleRows.forEach((row) => rolesByUserId.set(row.userId, [...(rolesByUserId.get(row.userId) ?? []), row.role]));
    return memberRows
      .map((member) => ({ ...member, roles: (rolesByUserId.get(member.id) ?? []).sort() }))
      .sort((left, right) => left.displayName.localeCompare(right.displayName));
  }

  async updateModuleUserDesignation(orgId: string, productId: string, userId: string, designation: string, user: AuthUser) {
    const moduleUsers = await this.listModuleUsers(orgId, productId, user);
    if (!moduleUsers.some((member) => member.id === userId)) {
      throw new BadRequestException('User is not eligible for this organisation module');
    }
    const value = designation.trim();
    if (!value) {
      await this.db
        .delete(moduleUserDesignations)
        .where(and(
          eq(moduleUserDesignations.orgId, orgId),
          eq(moduleUserDesignations.productId, productId),
          eq(moduleUserDesignations.userId, userId),
        ));
      return { userId, designation: '' };
    }
    const [saved] = await this.db
      .insert(moduleUserDesignations)
      .values({ orgId, productId, userId, designation: value })
      .onConflictDoUpdate({
        target: [moduleUserDesignations.orgId, moduleUserDesignations.productId, moduleUserDesignations.userId],
        set: { designation: value, updatedAt: new Date() },
      })
      .returning({ userId: moduleUserDesignations.userId, designation: moduleUserDesignations.designation });
    return saved;
  }

  async getProductIntegration(orgId: string, productId: string, provider: string, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    await this.assertActiveModule(orgId, productId);
    const [configuration] = await this.db
      .select({
        provider: organisationProductIntegrations.provider,
        baseUrl: organisationProductIntegrations.baseUrl,
        authorizationSecret: organisationProductIntegrations.authorizationSecret,
        webhookTokenHash: organisationProductIntegrations.webhookTokenHash,
        webhookTokenPrefix: organisationProductIntegrations.webhookTokenPrefix,
        webhookTokenCreatedAt: organisationProductIntegrations.webhookTokenCreatedAt,
        updatedAt: organisationProductIntegrations.updatedAt,
      })
      .from(organisationProductIntegrations)
      .where(and(
        eq(organisationProductIntegrations.orgId, orgId),
        eq(organisationProductIntegrations.productId, productId),
        eq(organisationProductIntegrations.provider, provider),
      ));
    return {
      provider,
      baseUrl: configuration?.baseUrl ?? '',
      authorizationKeyConfigured: !!configuration?.authorizationSecret,
      webhookTokenConfigured: !!configuration?.webhookTokenHash,
      webhookTokenPrefix: configuration?.webhookTokenPrefix ?? null,
      webhookTokenCreatedAt: configuration?.webhookTokenCreatedAt ?? null,
      webhookPath: `/api/organisations/${orgId}/modules/${productId}/integrations/signit/webhook`,
      updatedAt: configuration?.updatedAt ?? null,
    };
  }

  async updateProductIntegration(
    orgId: string,
    productId: string,
    provider: string,
    input: { baseUrl?: string; authorizationKey?: string; clearAuthorizationKey?: boolean },
    user: AuthUser,
  ) {
    await this.assertCanManageTeam(orgId, user);
    await this.assertActiveModule(orgId, productId);
    const suppliedKey = input.authorizationKey?.trim();
    const suppliedBaseUrl = input.baseUrl?.trim();
    if (suppliedKey && input.clearAuthorizationKey) {
      throw new BadRequestException('Provide a replacement authorization key or clear the existing key, not both');
    }
    const [existing] = await this.db
      .select()
      .from(organisationProductIntegrations)
      .where(and(
        eq(organisationProductIntegrations.orgId, orgId),
        eq(organisationProductIntegrations.productId, productId),
        eq(organisationProductIntegrations.provider, provider),
      ));
    if (!existing && input.clearAuthorizationKey) {
      throw new BadRequestException('Integration configuration not found');
    }
    let baseUrl = existing?.baseUrl ?? null;
    if (suppliedBaseUrl) {
      let parsedBaseUrl: URL;
      try {
        parsedBaseUrl = new URL(suppliedBaseUrl);
      } catch {
        throw new BadRequestException('Base URL must be a valid HTTP or HTTPS URL');
      }
      if (!['http:', 'https:'].includes(parsedBaseUrl.protocol)) {
        throw new BadRequestException('Base URL must use HTTP or HTTPS');
      }
      baseUrl = parsedBaseUrl.toString().replace(/\/$/, '');
    }
    if (!input.clearAuthorizationKey && !baseUrl) {
      throw new BadRequestException('Base URL is required');
    }
    if (!input.clearAuthorizationKey && !suppliedKey && !existing?.authorizationSecret) {
      throw new BadRequestException('Authorization key is required');
    }
    const authorizationSecret = input.clearAuthorizationKey
      ? null
      : suppliedKey
        ? encryptSecret(suppliedKey)
        : existing!.authorizationSecret;
    await this.db
      .insert(organisationProductIntegrations)
      .values({ orgId, productId, provider, baseUrl, authorizationSecret, updatedBy: user.id })
      .onConflictDoUpdate({
        target: [organisationProductIntegrations.orgId, organisationProductIntegrations.productId, organisationProductIntegrations.provider],
        set: { baseUrl, authorizationSecret, updatedBy: user.id, updatedAt: new Date() },
      });
    return this.getProductIntegration(orgId, productId, provider, user);
  }

  async getProductIntegrationAuthorizationKey(orgId: string, productId: string, provider: string) {
    await this.assertActiveModule(orgId, productId);
    const [configuration] = await this.db
      .select({ authorizationSecret: organisationProductIntegrations.authorizationSecret })
      .from(organisationProductIntegrations)
      .where(and(
        eq(organisationProductIntegrations.orgId, orgId),
        eq(organisationProductIntegrations.productId, productId),
        eq(organisationProductIntegrations.provider, provider),
      ));
    return configuration?.authorizationSecret ? decryptSecret(configuration.authorizationSecret) : null;
  }

  async createSignitEnvelope(
    orgId: string,
    productId: string,
    payload: unknown,
    files: Array<{ originalname: string; mimetype: string; buffer: Buffer }>,
    serviceKey: string | undefined,
    user: AuthUser,
  ) {
    const expectedServiceKey = this.config.get<string>('CREDITGUARD_INTERNAL_API_KEY');
    if (!expectedServiceKey || !serviceKey) throw new ForbiddenException('CreditGuard service authentication required');
    const expected = Buffer.from(expectedServiceKey);
    const supplied = Buffer.from(serviceKey);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new ForbiddenException('CreditGuard service authentication required');
    }
    await this.assertActiveMember(orgId, user);
    await this.assertActiveModule(orgId, productId);
    const signitPayload = this.validateSignitPayload(payload);
    if (files.length === 0) throw new BadRequestException('At least one PDF is required');
    if (files.some((file) => file.mimetype !== 'application/pdf' || file.buffer.subarray(0, 5).toString() !== '%PDF-')) {
      throw new BadRequestException('Every Signit file must be a valid PDF');
    }
    const [configuration] = await this.db
      .select({
        baseUrl: organisationProductIntegrations.baseUrl,
        authorizationSecret: organisationProductIntegrations.authorizationSecret,
      })
      .from(organisationProductIntegrations)
      .where(and(
        eq(organisationProductIntegrations.orgId, orgId),
        eq(organisationProductIntegrations.productId, productId),
        eq(organisationProductIntegrations.provider, 'signit'),
      ));
    if (!configuration?.baseUrl || !configuration.authorizationSecret) {
      throw new ConflictException('Signit integration is not configured');
    }

    const form = new FormData();
    form.append('payload', JSON.stringify(signitPayload));
    files.forEach((file) => {
      form.append('files', new Blob([new Uint8Array(file.buffer)], { type: 'application/pdf' }), file.originalname);
    });
    const endpoint = signitApiEndpoint(configuration.baseUrl, 'envelope/create');
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: decryptSecret(configuration.authorizationSecret) },
        body: form,
      });
    } catch {
      throw new BadGatewayException('Signit could not be reached');
    }
    if (!response.ok) throw new BadGatewayException(`Signit rejected the envelope request (${response.status})`);
    const result = await response.json().catch(() => null) as { id?: unknown } | null;
    if (!result || typeof result.id !== 'string' || !result.id.trim() || result.id.length > 500) {
      throw new BadGatewayException('Signit did not return a valid envelope ID');
    }
    const envelopeId = result.id.trim();
    let distributionResponse: Response;
    try {
      distributionResponse = await fetch(signitApiEndpoint(configuration.baseUrl, 'envelope/distribute'), {
        method: 'POST',
        headers: {
          Authorization: decryptSecret(configuration.authorizationSecret),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ envelopeId }),
      });
    } catch {
      throw new BadGatewayException('Signit envelope was created but could not be distributed');
    }
    if (!distributionResponse.ok) {
      throw new BadGatewayException(`Signit rejected the envelope distribution (${distributionResponse.status})`);
    }
    const distribution = await distributionResponse.json().catch(() => null) as { id?: unknown; recipients?: unknown } | null;
    if (distribution?.id !== envelopeId || !Array.isArray(distribution.recipients)) {
      throw new BadGatewayException('Signit returned an invalid envelope distribution');
    }
    const recipients = distribution.recipients.map((recipient) => {
      if (!recipient || typeof recipient !== 'object') throw new BadGatewayException('Signit returned an invalid recipient');
      const value = recipient as { email?: unknown; signingUrl?: unknown };
      if (typeof value.email !== 'string' || value.email.length > 320 || typeof value.signingUrl !== 'string' || value.signingUrl.length > 2048) {
        throw new BadGatewayException('Signit returned an invalid recipient signing URL');
      }
      let signingUrl: URL;
      try {
        signingUrl = new URL(value.signingUrl);
      } catch {
        throw new BadGatewayException('Signit returned an invalid recipient signing URL');
      }
      if (!['http:', 'https:'].includes(signingUrl.protocol)) {
        throw new BadGatewayException('Signit returned an invalid recipient signing URL');
      }
      return { email: value.email.trim().toLowerCase(), signingUrl: signingUrl.href };
    });
    const expectedEmails = new Set(signitPayload.recipients.map(({ email }) => email.trim().toLowerCase()));
    const recipientEmails = new Set(recipients.map(({ email }) => email));
    if (recipients.length !== recipientEmails.size || expectedEmails.size !== recipientEmails.size || [...expectedEmails].some((email) => !recipientEmails.has(email))) {
      throw new BadGatewayException('Signit did not return signing URLs for every recipient');
    }
    return { id: envelopeId, recipients };
  }

  async deleteSignitEnvelope(
    orgId: string,
    productId: string,
    envelopeId: unknown,
    serviceKey: string | undefined,
    user: AuthUser,
  ) {
    const expectedServiceKey = this.config.get<string>('CREDITGUARD_INTERNAL_API_KEY');
    if (!expectedServiceKey || !serviceKey) throw new ForbiddenException('CreditGuard service authentication required');
    const expected = Buffer.from(expectedServiceKey);
    const supplied = Buffer.from(serviceKey);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new ForbiddenException('CreditGuard service authentication required');
    }
    await this.assertCanManageTeam(orgId, user);
    await this.assertActiveModule(orgId, productId);
    if (typeof envelopeId !== 'string' || !envelopeId.trim() || envelopeId.length > 500) {
      throw new BadRequestException('A valid Signit envelope ID is required');
    }
    const [configuration] = await this.db
      .select({
        baseUrl: organisationProductIntegrations.baseUrl,
        authorizationSecret: organisationProductIntegrations.authorizationSecret,
      })
      .from(organisationProductIntegrations)
      .where(and(
        eq(organisationProductIntegrations.orgId, orgId),
        eq(organisationProductIntegrations.productId, productId),
        eq(organisationProductIntegrations.provider, 'signit'),
      ));
    if (!configuration?.baseUrl || !configuration.authorizationSecret) {
      throw new ConflictException('Signit integration is not configured');
    }

    let response: Response;
    try {
      response = await fetch(signitApiEndpoint(configuration.baseUrl, 'envelope/delete'), {
        method: 'POST',
        headers: {
          Authorization: decryptSecret(configuration.authorizationSecret),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ envelopeId: envelopeId.trim() }),
      });
    } catch {
      throw new BadGatewayException('Signit could not be reached');
    }
    if (!response.ok) throw new BadGatewayException(`Signit rejected the envelope recall (${response.status})`);
    const result = await response.json().catch(() => null) as { success?: unknown } | null;
    if (result?.success !== true) throw new BadGatewayException('Signit did not confirm the envelope recall');
    return { success: true };
  }

  async getSignitEnvelope(
    orgId: string,
    productId: string,
    envelopeId: string,
    serviceKey: string | undefined,
    user: AuthUser,
  ) {
    const expectedServiceKey = this.config.get<string>('CREDITGUARD_INTERNAL_API_KEY');
    if (!expectedServiceKey || !serviceKey) throw new ForbiddenException('CreditGuard service authentication required');
    const expected = Buffer.from(expectedServiceKey);
    const supplied = Buffer.from(serviceKey);
    if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
      throw new ForbiddenException('CreditGuard service authentication required');
    }
    await this.assertActiveMember(orgId, user);
    await this.assertActiveModule(orgId, productId);
    if (!envelopeId.trim() || envelopeId.length > 500) throw new BadRequestException('A valid Signit envelope ID is required');
    const [configuration] = await this.db
      .select({
        baseUrl: organisationProductIntegrations.baseUrl,
        authorizationSecret: organisationProductIntegrations.authorizationSecret,
      })
      .from(organisationProductIntegrations)
      .where(and(
        eq(organisationProductIntegrations.orgId, orgId),
        eq(organisationProductIntegrations.productId, productId),
        eq(organisationProductIntegrations.provider, 'signit'),
      ));
    if (!configuration?.baseUrl || !configuration.authorizationSecret) {
      throw new ConflictException('Signit integration is not configured');
    }

    return this.fetchSignitEnvelopeStatus(configuration.baseUrl, configuration.authorizationSecret, envelopeId.trim());
  }

  async generateSignitWebhookToken(orgId: string, productId: string, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    await this.assertActiveModule(orgId, productId);
    const [configuration] = await this.db
      .select({ id: organisationProductIntegrations.id })
      .from(organisationProductIntegrations)
      .where(and(
        eq(organisationProductIntegrations.orgId, orgId),
        eq(organisationProductIntegrations.productId, productId),
        eq(organisationProductIntegrations.provider, 'signit'),
      ));
    if (!configuration) throw new ConflictException('Configure Signit before generating a webhook token');

    const token = `cgw_${randomBytes(48).toString('base64url')}`;
    const createdAt = new Date();
    await this.db
      .update(organisationProductIntegrations)
      .set({
        webhookTokenHash: createHash('sha256').update(token).digest('hex'),
        webhookTokenPrefix: token.slice(0, 12),
        webhookTokenCreatedAt: createdAt,
        updatedBy: user.id,
        updatedAt: createdAt,
      })
      .where(eq(organisationProductIntegrations.id, configuration.id));
    return {
      token,
      webhookPath: `/api/organisations/${orgId}/modules/${productId}/integrations/signit/webhook`,
      tokenPrefix: token.slice(0, 12),
      createdAt,
    };
  }

  async revokeSignitWebhookToken(orgId: string, productId: string, user: AuthUser) {
    await this.assertCanManageTeam(orgId, user);
    await this.assertActiveModule(orgId, productId);
    const [updated] = await this.db
      .update(organisationProductIntegrations)
      .set({ webhookTokenHash: null, webhookTokenPrefix: null, webhookTokenCreatedAt: null, updatedBy: user.id, updatedAt: new Date() })
      .where(and(
        eq(organisationProductIntegrations.orgId, orgId),
        eq(organisationProductIntegrations.productId, productId),
        eq(organisationProductIntegrations.provider, 'signit'),
      ))
      .returning({ id: organisationProductIntegrations.id });
    if (!updated) throw new NotFoundException('Signit integration is not configured');
    return { success: true };
  }

  async processSignitWebhook(
    orgId: string,
    productId: string,
    envelopeId: string,
    webhookToken: string | undefined,
  ) {
    const [configuration] = await this.db
      .select({
        baseUrl: organisationProductIntegrations.baseUrl,
        authorizationSecret: organisationProductIntegrations.authorizationSecret,
        webhookTokenHash: organisationProductIntegrations.webhookTokenHash,
      })
      .from(organisationProductIntegrations)
      .where(and(
        eq(organisationProductIntegrations.orgId, orgId),
        eq(organisationProductIntegrations.productId, productId),
        eq(organisationProductIntegrations.provider, 'signit'),
      ));
    const suppliedHash = webhookToken && webhookToken.length <= 500
      ? createHash('sha256').update(webhookToken).digest('hex')
      : '';
    const expectedHash = configuration?.webhookTokenHash ?? '';
    const supplied = Buffer.from(suppliedHash);
    const expected = Buffer.from(expectedHash);
    if (!suppliedHash || !expectedHash || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new UnauthorizedException('Invalid webhook token');
    }
    await this.assertActiveModule(orgId, productId);
    if (!configuration?.baseUrl || !configuration.authorizationSecret) {
      throw new ConflictException('Signit integration is not configured');
    }
    if (!envelopeId.trim() || envelopeId.length > 500) throw new BadRequestException('A valid Signit envelope ID is required');
    const envelope = await this.fetchSignitEnvelopeStatus(configuration.baseUrl, configuration.authorizationSecret, envelopeId.trim());
    const serviceKey = this.config.get<string>('CREDITGUARD_INTERNAL_API_KEY');
    if (!serviceKey) throw new BadGatewayException('CreditGuard service authentication is not configured');
    const creditGuardApiUrl = (this.config.get<string>('CREDITGUARD_API_URL') ?? 'http://localhost:4101/api').replace(/\/$/, '');
    let response: Response;
    try {
      response = await fetch(`${creditGuardApiUrl}/internal/signit/envelope-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CreditGuard-Service-Key': serviceKey },
        body: JSON.stringify({ orgId, envelopeId: envelopeId.trim(), ...envelope }),
      });
    } catch {
      throw new BadGatewayException('CreditGuard service could not be reached');
    }
    if (!response.ok) {
      const errorResult = await response.json().catch(() => null) as { message?: unknown } | null;
      const message = typeof errorResult?.message === 'string' && errorResult.message.length <= 500
        ? errorResult.message
        : `CreditGuard rejected the webhook update (${response.status})`;
      throw new BadGatewayException(message);
    }
    return response.json().catch(() => ({ success: true }));
  }

  private async fetchSignitEnvelopeStatus(baseUrl: string, authorizationSecret: string, envelopeId: string) {

    let response: Response;
    try {
      response = await fetch(signitApiEndpoint(baseUrl, `envelope/${encodeURIComponent(envelopeId)}`), {
        headers: { Authorization: decryptSecret(authorizationSecret) },
      });
    } catch {
      throw new BadGatewayException('Signit could not be reached');
    }
    if (!response.ok) throw new BadGatewayException(`Signit rejected the envelope status request (${response.status})`);
    const document = await response.json().catch(() => null) as { id?: unknown; title?: unknown; status?: unknown; recipients?: unknown } | null;
    if (!document || (document.id !== undefined && document.id !== envelopeId) || !Array.isArray(document.recipients)) {
      throw new BadGatewayException('Signit returned an invalid envelope status');
    }
    const recipients = document.recipients.map((recipient) => {
      if (!recipient || typeof recipient !== 'object') throw new BadGatewayException('Signit returned an invalid recipient status');
      const value = recipient as {
        email?: unknown;
        status?: unknown;
        signingStatus?: unknown;
        signedAt?: unknown;
        rejectedAt?: unknown;
        completedAt?: unknown;
      };
      if (typeof value.email !== 'string' || !/^\S+@\S+\.\S+$/.test(value.email) || value.email.length > 320) {
        throw new BadGatewayException('Signit returned an invalid recipient status');
      }
      const providerStatus = typeof value.signingStatus === 'string'
        ? value.signingStatus.toUpperCase()
        : typeof value.status === 'string'
          ? value.status.toUpperCase()
          : '';
      const approvalStatus = ['SIGNED', 'APPROVED', 'COMPLETED'].includes(providerStatus)
        ? 'approved' as const
        : ['REJECTED', 'DECLINED'].includes(providerStatus)
          ? 'rejected' as const
          : 'pending' as const;
      const actionedValue = value.signedAt ?? value.rejectedAt ?? value.completedAt;
      let actionedDate: string | null = null;
      if (approvalStatus !== 'pending' && typeof actionedValue === 'string') {
        const parsed = new Date(actionedValue);
        if (!Number.isNaN(parsed.getTime())) actionedDate = parsed.toISOString();
      }
      return { email: value.email.trim().toLowerCase(), approvalStatus, actionedDate };
    });
    const emails = new Set(recipients.map(({ email }) => email));
    if (emails.size !== recipients.length) throw new BadGatewayException('Signit returned duplicate recipient statuses');
    return {
      title: typeof document.title === 'string' && document.title.length <= 500 ? document.title : null,
      status: typeof document.status === 'string' && document.status.length <= 100 ? document.status : null,
      recipients,
    };
  }

  private validateSignitPayload(payload: unknown) {
    if (!payload || typeof payload !== 'object') throw new BadRequestException('Signit payload is invalid');
    const input = payload as { type?: unknown; title?: unknown; externalId?: unknown; recipients?: unknown; meta?: unknown };
    if (input.type !== 'DOCUMENT' || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 500) {
      throw new BadRequestException('Signit document type and title are required');
    }
    if (typeof input.externalId !== 'string' || !input.externalId.trim() || input.externalId.length > 500) {
      throw new BadRequestException('Signit external ID is required');
    }
    if (!Array.isArray(input.recipients) || input.recipients.length === 0 || input.recipients.length > 50) {
      throw new BadRequestException('Between 1 and 50 Signit recipients are required');
    }
    const recipients = input.recipients.map((recipient) => {
      if (!recipient || typeof recipient !== 'object') throw new BadRequestException('Signit recipient is invalid');
      const value = recipient as { email?: unknown; name?: unknown; role?: unknown; signingOrder?: unknown };
      if (typeof value.email !== 'string' || !/^\S+@\S+\.\S+$/.test(value.email) || value.email.length > 320) {
        throw new BadRequestException('Every Signit recipient must have a valid email');
      }
      if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200 || value.role !== 'APPROVER') {
        throw new BadRequestException('Every Signit recipient must have a name and APPROVER role');
      }
      if (!Number.isInteger(value.signingOrder) || (value.signingOrder as number) < 1 || (value.signingOrder as number) > 50) {
        throw new BadRequestException('Every Signit recipient must have a valid signing order');
      }
      return { email: value.email, name: value.name.trim(), role: 'APPROVER' as const, signingOrder: value.signingOrder as number };
    });
    const signingOrders = [...recipients].map(({ signingOrder }) => signingOrder).sort((left, right) => left - right);
    if (signingOrders.some((signingOrder, index) => signingOrder !== index + 1)) {
      throw new BadRequestException('Signit recipient signing orders must be unique and contiguous from one');
    }
    if (!input.meta || typeof input.meta !== 'object' || (input.meta as { signingOrder?: unknown }).signingOrder !== 'SEQUENTIAL') {
      throw new BadRequestException('Signit document signing order must be SEQUENTIAL');
    }
    return {
      type: 'DOCUMENT' as const,
      title: input.title.trim(),
      externalId: input.externalId.trim(),
      recipients,
      meta: { signingOrder: 'SEQUENTIAL' as const },
    };
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

  private async assertActiveModule(orgId: string, productId: string) {
    const [module] = await this.db
      .select({ id: organisationModules.id })
      .from(organisationModules)
      .where(and(
        eq(organisationModules.orgId, orgId),
        eq(organisationModules.productId, productId),
        eq(organisationModules.status, 'active'),
        or(isNull(organisationModules.validTo), gt(organisationModules.validTo, new Date())),
      ));
    if (!module) throw new NotFoundException('Active organisation module assignment not found');
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
