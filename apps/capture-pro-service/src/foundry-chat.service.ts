import { BadGatewayException, BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, desc, eq, gte, sql } from 'drizzle-orm';
import type { ProductAuthUser } from './auth/product-auth.guard';
import type { CaptureProDb } from './db';
import { CAPTURE_PRO_DB } from './db/database.module';
import { auditEvents, foundryConversations, foundryMessages, salesforceOpportunities, spinergieCharters, spinergieVessels } from './db/schema';
import { SalesforceOpportunitiesService } from './salesforce/salesforce-opportunities.service';

type Status = { configured: boolean; ready: boolean; reason: string | null; agentName: string | null; binding: string | null };
type Context = { opportunityId?: string; vesselId?: string; charterId?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const conversationView = { id: foundryConversations.id, title: foundryConversations.title, blocked: foundryConversations.blocked, updatedAt: foundryConversations.updatedAt };

@Injectable()
export class FoundryChatService {
  constructor(@Inject(CAPTURE_PRO_DB) private readonly db: CaptureProDb, private readonly config: ConfigService, private readonly access: SalesforceOpportunitiesService) {}

  private async core<T>(orgId: string, productId: string, authorization: string, action: 'status' | 'threads' | 'reply', body?: unknown): Promise<T> {
    const key = this.config.get<string>('CAPTUREPRO_INTERNAL_API_KEY');
    if (!key) throw new ServiceUnavailableException('Capture-Pro service authentication is not configured.');
    try {
      const base = (this.config.get<string>('CORE_API_URL') ?? 'http://localhost:4000/api').replace(/\/$/, '');
      const response = await fetch(`${base}/organisations/${encodeURIComponent(orgId)}/modules/${encodeURIComponent(productId)}/agent-chat/${action}`, {
        method: action === 'status' ? 'GET' : 'POST', headers: { Authorization: authorization, 'X-CapturePro-Service-Key': key, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'error', signal: AbortSignal.timeout(action === 'status' ? 30_000 : 120_000),
      });
      if (!response.ok) { await response.body?.cancel(); throw new BadGatewayException('Foundry chat could not complete. Check the connection status or start a new conversation.'); }
      return await response.json() as T;
    } catch (error: unknown) {
      if (error instanceof BadGatewayException) throw error;
      throw new BadGatewayException('The agent connection is unavailable or timed out.');
    }
  }

  async status(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const { orgId, productId } = await this.access.agentChatAccess(orgIdInput, user, authorization);
    const status = await this.core<Status>(orgId, productId, authorization, 'status');
    if (typeof status.ready !== 'boolean' || typeof status.configured !== 'boolean') throw new BadGatewayException('Invalid agent connection status.');
    const { binding: _binding, ...view } = status;
    return view;
  }

  async list(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const { orgId } = await this.access.agentChatAccess(orgIdInput, user, authorization);
    return this.db.select(conversationView).from(foundryConversations).where(and(eq(foundryConversations.orgId, orgId), eq(foundryConversations.ownerId, user.id)))
      .orderBy(desc(foundryConversations.updatedAt)).limit(100);
  }

  async create(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const { orgId, productId } = await this.access.agentChatAccess(orgIdInput, user, authorization);
    const status = await this.core<Status>(orgId, productId, authorization, 'status');
    if (!status.ready || !status.binding || !/^[a-f0-9]{64}$/.test(status.binding)) throw new ServiceUnavailableException(status.reason ?? 'The Foundry agent is not ready.');
    const [row] = await this.db.insert(foundryConversations).values({ orgId, ownerId: user.id, binding: status.binding }).returning(conversationView);
    return row;
  }

  private async owned(orgId: string, userId: string, id: string) {
    if (!uuid.test(id)) throw new BadRequestException('Invalid conversation identifier.');
    const [row] = await this.db.select().from(foundryConversations).where(and(eq(foundryConversations.id, id), eq(foundryConversations.orgId, orgId), eq(foundryConversations.ownerId, userId)));
    if (!row) throw new NotFoundException('Conversation not found.');
    return row;
  }

  async messages(orgIdInput: unknown, id: string, user: ProductAuthUser, authorization: string) {
    const { orgId } = await this.access.agentChatAccess(orgIdInput, user, authorization);
    const conversation = await this.owned(orgId, user.id, id);
    const messages = await this.db.select({ id: foundryMessages.id, role: foundryMessages.role, text: foundryMessages.text, status: foundryMessages.status, sources: foundryMessages.sources, error: foundryMessages.error, createdAt: foundryMessages.createdAt })
      .from(foundryMessages).where(and(eq(foundryMessages.orgId, orgId), eq(foundryMessages.ownerId, user.id), eq(foundryMessages.conversationId, id))).orderBy(asc(foundryMessages.createdAt)).limit(101);
    return { conversation: { id: conversation.id, title: conversation.title, blocked: conversation.blocked, updatedAt: conversation.updatedAt }, messages };
  }

  private async context(orgId: string, selection: Context) {
    const result: Record<string, unknown> = {};
    if (selection.opportunityId) {
      if (!/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(selection.opportunityId)) throw new BadRequestException('Invalid opportunity identifier.');
      const [row] = await this.db.select({ fields: salesforceOpportunities.fields, lastSeenAt: salesforceOpportunities.lastSeenAt }).from(salesforceOpportunities)
        .where(and(eq(salesforceOpportunities.orgId, orgId), eq(salesforceOpportunities.salesforceId, selection.opportunityId), eq(salesforceOpportunities.inExtract, true)));
      if (!row) throw new ForbiddenException('Selected opportunity is unavailable in this organisation.');
      result.opportunity = row;
    }
    if (selection.vesselId) {
      if (!/^\d{1,16}$/.test(selection.vesselId)) throw new BadRequestException('Invalid vessel identifier.');
      const [row] = await this.db.select({ fields: spinergieVessels.fields, lastSeenAt: spinergieVessels.lastSeenAt }).from(spinergieVessels)
        .where(and(eq(spinergieVessels.orgId, orgId), eq(spinergieVessels.vesselId, selection.vesselId), eq(spinergieVessels.inExtract, true)));
      if (!row) throw new ForbiddenException('Selected vessel is unavailable in this organisation.');
      result.vessel = row;
    }
    if (selection.charterId) {
      if (!/^[a-f0-9]{64}$/.test(selection.charterId)) throw new BadRequestException('Invalid charter identifier.');
      const [row] = await this.db.select({ fields: spinergieCharters.fields, lastSeenAt: spinergieCharters.lastSeenAt }).from(spinergieCharters)
        .where(and(eq(spinergieCharters.orgId, orgId), eq(spinergieCharters.charterId, selection.charterId), eq(spinergieCharters.inExtract, true)));
      if (!row) throw new ForbiddenException('Selected charter is unavailable in this organisation.');
      result.charter = row;
    }
    const text = Object.keys(result).length ? JSON.stringify(result) : '';
    if (text.length > 32_000) throw new BadRequestException('Selected source context is too large. Select fewer sources.');
    return text;
  }

  async send(orgIdInput: unknown, id: string, message: string, selection: Context, user: ProductAuthUser, authorization: string) {
    const { orgId, productId } = await this.access.agentChatAccess(orgIdInput, user, authorization);
    const conversation = await this.owned(orgId, user.id, id);
    if (conversation.blocked) throw new ConflictException('This conversation needs a new thread. Start a new conversation.');
    const context = await this.context(orgId, selection);
    const status = await this.core<Status>(orgId, productId, authorization, 'status');
    if (!status.ready || status.binding !== conversation.binding) throw new ServiceUnavailableException(status.reason ?? 'The agent changed. Start a new conversation.');
    const filter = and(eq(foundryConversations.id, id), eq(foundryConversations.orgId, orgId), eq(foundryConversations.ownerId, user.id));
    const sent = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`foundry-chat-user:${orgId}:${user.id}`}))`);
      const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
      const [{ count }] = await tx.select({ count: sql<number>`count(*)::int` }).from(foundryMessages)
        .where(and(eq(foundryMessages.orgId, orgId), eq(foundryMessages.ownerId, user.id), eq(foundryMessages.role, 'user'), gte(foundryMessages.createdAt, dayStart)));
      if (count >= 100) throw new ConflictException('Daily message limit reached. Try again tomorrow.');
      const [busy] = await tx.select({ id: foundryMessages.id }).from(foundryMessages).where(and(eq(foundryMessages.orgId, orgId), eq(foundryMessages.ownerId, user.id), eq(foundryMessages.status, 'Sending'), gte(foundryMessages.createdAt, new Date(Date.now() - 180_000)))).limit(1);
      if (busy) throw new ConflictException('Another agent request is still being processed.');
      const [locked] = await tx.update(foundryConversations).set({ blocked: true, updatedAt: new Date() }).where(and(filter, eq(foundryConversations.blocked, false))).returning();
      if (!locked) throw new ConflictException('A message is already being processed.');
      const existing = await tx.select({ id: foundryMessages.id }).from(foundryMessages).where(and(eq(foundryMessages.orgId, orgId), eq(foundryMessages.ownerId, user.id), eq(foundryMessages.conversationId, id))).limit(101);
      if (existing.length >= 100) throw new ConflictException('Conversation limit reached. Start a new conversation.');
      const [row] = await tx.insert(foundryMessages).values({ orgId, ownerId: user.id, conversationId: id, role: 'user', text: message, status: 'Sending' }).returning();
      return row;
    });
    {
      try {
        let threadId = conversation.threadId;
        if (!threadId) {
          const thread = await this.core<{ threadId: string }>(orgId, productId, authorization, 'threads', { binding: conversation.binding });
          if (!/^thread_[A-Za-z0-9_-]+$/.test(thread.threadId)) throw new BadGatewayException('Foundry returned an invalid thread reference.');
          threadId = thread.threadId;
          await this.db.update(foundryConversations).set({ threadId }).where(filter);
        }
        const reply = await this.core<{ threadId: string; text: string; sources: Array<{ label: string }> }>(orgId, productId, authorization, 'reply', { binding: conversation.binding, threadId, message, context });
        if (!/^thread_[A-Za-z0-9_-]+$/.test(reply.threadId) || typeof reply.text !== 'string' || !reply.text || reply.text.length > 64_000 || !Array.isArray(reply.sources)) throw new BadGatewayException('Foundry returned an invalid chat response.');
        await this.db.transaction(async (tx) => {
          await tx.update(foundryMessages).set({ status: 'Complete' }).where(and(eq(foundryMessages.id, sent.id), eq(foundryMessages.orgId, orgId), eq(foundryMessages.ownerId, user.id)));
          await tx.insert(foundryMessages).values({ orgId, ownerId: user.id, conversationId: id, role: 'assistant', text: reply.text, status: 'Complete', sources: reply.sources });
          await tx.update(foundryConversations).set({ threadId: reply.threadId, title: conversation.title === 'New conversation' ? message.slice(0, 100) : conversation.title, blocked: false, updatedAt: new Date() }).where(filter);
          await tx.insert(auditEvents).values({ orgId, actorType: 'Human', actorId: user.id, action: 'Foundry chat response received', details: { conversationId: id, sourceKinds: Object.keys(selection).filter((key) => selection[key as keyof Context]) } });
        });
      } catch {
        await this.db.update(foundryMessages).set({ status: 'Failed', error: 'The agent could not complete this response. Start a new conversation before retrying.' }).where(and(eq(foundryMessages.id, sent.id), eq(foundryMessages.orgId, orgId), eq(foundryMessages.ownerId, user.id)));
        throw new BadGatewayException('The agent could not complete this response. Start a new conversation before retrying.');
      }
    }
    return this.messages(orgId, id, user, authorization);
  }
}