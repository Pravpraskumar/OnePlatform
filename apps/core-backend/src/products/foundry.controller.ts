import { Body, Controller, Get, Header, Headers, HttpCode, Inject, Param, ParseUUIDPipe, Post, ServiceUnavailableException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gt, isNull, lte, or } from 'drizzle-orm';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { AuthUser } from '../auth/auth-user.interface';
import { CurrentUser } from '../auth/current-user.decorator';
import type { CoreDb } from '../db';
import { CORE_DB } from '../db/database.module';
import { organisationModules, organisations } from '../db/schema';
import { ProductsService } from './products.service';
import { FoundryClient } from './foundry-client';

@Controller('organisations/:orgId/modules/:productId/agent-chat')
export class FoundryController {
  private client: FoundryClient | null = null;
  constructor(private readonly config: ConfigService, private readonly products: ProductsService, @Inject(CORE_DB) private readonly db: CoreDb) {}

  private async access(orgId: string, productId: string, serviceKey: string | undefined, user: AuthUser) {
    const expected = this.config.get<string>('CAPTUREPRO_INTERNAL_API_KEY');
    if (!expected || !serviceKey || Buffer.byteLength(expected) !== Buffer.byteLength(serviceKey) || !timingSafeEqual(Buffer.from(expected), Buffer.from(serviceKey))) throw new ForbiddenException('Capture-Pro service authentication required');
    const available = await this.products.listProducts(user, orgId);
    if (!available.some((product) => product.id === productId && product.code === 'Capture-Pro')) throw new ForbiddenException('Capture-Pro access required');
    const now = new Date();
    const [assignment] = await this.db.select({ id: organisationModules.id }).from(organisationModules).innerJoin(organisations, eq(organisations.id, organisationModules.orgId))
      .where(and(eq(organisationModules.orgId, orgId), eq(organisationModules.productId, productId), eq(organisationModules.status, 'active'), eq(organisations.status, 'active'), lte(organisationModules.validFrom, now), or(isNull(organisationModules.validTo), gt(organisationModules.validTo, now))));
    if (!assignment) throw new ForbiddenException('An active Capture-Pro assignment is required');
    if (this.config.get<string>('FOUNDRY_ENABLED') !== 'true' || this.config.get<string>('FOUNDRY_ORGANISATION_ID') !== orgId) return null;
    const endpoint = this.config.get<string>('FOUNDRY_PROJECT_ENDPOINT');
    if (!endpoint) return null;
    this.client ??= new FoundryClient(endpoint, { id: this.config.get<string>('FOUNDRY_AGENT_ID') || undefined, name: this.config.get<string>('FOUNDRY_AGENT_NAME') || undefined }, this.config.get<string>('FOUNDRY_IDENTITY') ?? 'azure-cli', this.config.get<string>('FOUNDRY_MANAGED_IDENTITY_CLIENT_ID'));
    return this.client;
  }

  private binding(client: FoundryClient, agentId: string) { return createHash('sha256').update(`${client.endpoint}:${agentId}`).digest('hex'); }

  @Get('status')
  @Header('Cache-Control', 'no-store')
  async status(@Param('orgId', ParseUUIDPipe) orgId: string, @Param('productId', ParseUUIDPipe) productId: string, @Headers('x-capturepro-service-key') key: string | undefined, @CurrentUser() user: AuthUser) {
    const client = await this.access(orgId, productId, key, user);
    if (!client) return { configured: false, ready: false, reason: 'Foundry chat is not configured for this organisation.', agentName: null, binding: null };
    try { const agent = await client.agent(); return { configured: true, ready: true, reason: null, agentName: agent.name, binding: this.binding(client, agent.id) }; }
    catch (error: unknown) { return { configured: true, ready: false, reason: error instanceof ServiceUnavailableException ? error.message : 'Foundry connection verification failed. Check project access, agent configuration and certificate trust.', agentName: this.config.get<string>('FOUNDRY_AGENT_NAME') ?? null, binding: null }; }
  }

  @Post('threads')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async thread(@Param('orgId', ParseUUIDPipe) orgId: string, @Param('productId', ParseUUIDPipe) productId: string, @Headers('x-capturepro-service-key') key: string | undefined, @CurrentUser() user: AuthUser, @Body() input: unknown) {
    const client = await this.access(orgId, productId, key, user);
    if (!client) throw new ServiceUnavailableException('Foundry chat is not configured for this organisation.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Invalid thread request.');
    const body = input as Record<string, unknown>;
    if (Object.keys(body).some((field) => field !== 'binding') || typeof body.binding !== 'string') throw new BadRequestException('Invalid thread request.');
    const agent = await client.agent();
    if (body.binding !== this.binding(client, agent.id)) throw new BadRequestException('The agent changed. Start a new conversation.');
    return { threadId: await client.createThread() };
  }

  @Post('reply')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async reply(@Param('orgId', ParseUUIDPipe) orgId: string, @Param('productId', ParseUUIDPipe) productId: string, @Headers('x-capturepro-service-key') key: string | undefined, @CurrentUser() user: AuthUser, @Body() input: unknown) {
    const client = await this.access(orgId, productId, key, user);
    if (!client) throw new ServiceUnavailableException('Foundry chat is not configured for this organisation.');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('Invalid chat request');
    const body = input as Record<string, unknown>;
    if (Object.keys(body).some((field) => !['threadId', 'message', 'context', 'binding'].includes(field)) || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 8000 || typeof body.context !== 'string' || body.context.length > 32_000 || typeof body.binding !== 'string'
      || typeof body.threadId !== 'string' || !/^thread_[A-Za-z0-9_-]+$/.test(body.threadId)) throw new BadRequestException('Invalid or oversized chat request');
    const agent = await client.agent();
    if (body.binding !== this.binding(client, agent.id)) throw new BadRequestException('The configured agent changed. Start a new conversation.');
    const threadId = body.threadId;
    return { threadId, ...await client.reply(threadId, body.message, body.context) };
  }
}