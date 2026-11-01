import { randomUUID } from 'node:crypto';
import {
  BadGatewayException, BadRequestException, ConflictException, ForbiddenException, HttpException, Inject, Injectable, Logger, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { ProductAuthUser } from '../auth/product-auth.guard';
import type { CaptureProDb } from '../db';
import { CAPTURE_PRO_DB } from '../db/database.module';
import {
  auditEvents, salesforceAccounts, salesforceBidBudgets, salesforceCompetitors, salesforceFabricationYards, salesforceObjectFields,
  salesforceOpportunities, salesforceSyncRuns, salesforceVessels, spinergieCharters, spinergieCharterSyncRuns, spinergieSyncRuns, spinergieVessels, type SalesforceDescribedRecordTable,
} from '../db/schema';
import { parseSpinergieCharters, parseSpinergieVessels } from './spinergie-vessel.transform';
import {
  matchesCaptureProExtract, parseSalesforceAccountRecords, parseSalesforceBidBudgetRecords, parseSalesforceCompetitorRecords,
  parseSalesforceDescribedExtract, parseSalesforceRecords, transformSalesforceOpportunity,
  type SalesforceFieldValue, type TransformedSalesforceOpportunity,
} from './salesforce-opportunity.transform';

type SalesforceObjectType = 'Opportunity' | 'Account' | 'Competitor' | 'Bid Budget' | 'Fabrication Yard' | 'Vessel';
type ExtractObject = 'opportunities' | 'accounts' | 'competitors' | 'bid-budgets' | 'fabrication-yards' | 'vessels' | 'spinergie-vessels' | 'spinergie-charters';

// Salesforce objects imported with every queryable field, discovered by core on each sync.
const describedObjects: Record<'fabricationYards' | 'vessels', {
  table: SalesforceDescribedRecordTable; objectName: string; objectType: SalesforceObjectType; extract: ExtractObject; label: string; plural: string;
}> = {
  fabricationYards: {
    table: salesforceFabricationYards, objectName: 'Fabrication_Yard__c', objectType: 'Fabrication Yard', extract: 'fabrication-yards',
    label: 'fabrication yard', plural: 'fabrication yards',
  },
  vessels: { table: salesforceVessels, objectName: 'Vessel__c', objectType: 'Vessel', extract: 'vessels', label: 'vessel', plural: 'vessels' },
};
type DescribedObjectKey = keyof typeof describedObjects;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UPSERT_BATCH_SIZE = 500;
const CORE_TIMEOUT_MS = 15_000;
const EXTRACT_TIMEOUT_MS = 10 * 60_000;
export const SYNC_RUN_LOG_LIMIT = 50;

type SyncRunStatus = { status: string; startedAt: Date; completedAt: Date };

// Health is derived only from recorded sync runs (newest first); it never calls Salesforce.
export function salesforceSyncHealth(runs: SyncRunStatus[]) {
  const [latest] = runs;
  const lastSuccess = runs.find((run) => run.status === 'Succeeded') ?? null;
  const lastFailure = runs.find((run) => run.status === 'Failed') ?? null;
  const firstSuccessIndex = runs.findIndex((run) => run.status === 'Succeeded');
  return {
    status: !latest ? 'Not synchronized' as const : latest.status === 'Succeeded' ? 'Healthy' as const : 'Failing' as const,
    lastRunAt: latest?.completedAt ?? null,
    lastSuccessfulAt: lastSuccess?.completedAt ?? null,
    lastFailedAt: lastFailure?.completedAt ?? null,
    consecutiveFailures: firstSuccessIndex === -1 ? runs.length : firstSuccessIndex,
    recentRunCount: runs.length,
    recentSuccessCount: runs.filter((run) => run.status === 'Succeeded').length,
  };
}

const textValue = (value: SalesforceFieldValue | undefined) => (value === null || value === undefined ? null : String(value));
const numericValue = (value: SalesforceFieldValue | undefined) => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value) ? value : null;
};
const dateValue = (value: SalesforceFieldValue | undefined) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);
const salesforceIdValue = (value: SalesforceFieldValue | undefined) => (
  typeof value === 'string' && /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(value) ? value : null
);

@Injectable()
export class SalesforceOpportunitiesService {
  private readonly logger = new Logger(SalesforceOpportunitiesService.name);

  constructor(@Inject(CAPTURE_PRO_DB) private readonly db: CaptureProDb, private readonly config: ConfigService) {}

  private get coreApiUrl() {
    return (this.config.get<string>('CORE_API_URL') ?? 'http://localhost:4000/api').replace(/\/$/, '');
  }

  private organisation(orgId: unknown, user: ProductAuthUser) {
    if (typeof orgId !== 'string' || !uuidPattern.test(orgId)) throw new BadRequestException('A valid organisation is required');
    if (!user.organisations.some((organisation) => organisation.id === orgId)) {
      throw new ForbiddenException('Active organisation membership required');
    }
    return orgId;
  }

  private isIntegrationAdministrator(orgId: string, user: ProductAuthUser) {
    return user.globalRoles.includes('Global Administrator')
      || user.globalRoles.includes('Capture-Pro Module Administrator')
      || user.organisations.some((organisation) => organisation.id === orgId && ['Owner', 'Admin'].includes(organisation.membership ?? ''));
  }

  private canView(orgId: string, user: ProductAuthUser) {
    return this.isIntegrationAdministrator(orgId, user)
      || user.globalRoles.includes('Capture-Pro Manager')
      || user.globalRoles.includes('Capture-Pro Analyst');
  }

  async agentChatAccess(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.canView(orgId, user)) throw new ForbiddenException('A Capture-Pro role is required for agent chat');
    return { orgId, productId: await this.captureProProductId(orgId, authorization) };
  }

  // Core is authoritative for the active assignment, team restriction, and product-role binding.
  private async captureProProductId(orgId: string, authorization: string) {
    let response: Response;
    try {
      response = await fetch(`${this.coreApiUrl}/products?orgId=${encodeURIComponent(orgId)}`, {
        headers: { Authorization: authorization }, redirect: 'error', signal: AbortSignal.timeout(CORE_TIMEOUT_MS),
      });
    } catch {
      throw new BadGatewayException('Capture-Pro access could not be verified');
    }
    if (response.status === 401) throw new UnauthorizedException('Invalid bearer token');
    if (response.status === 403) throw new ForbiddenException('Capture-Pro is not available for this organisation');
    if (!response.ok) throw new BadGatewayException('Capture-Pro access could not be verified');
    const products = await response.json().catch(() => null) as unknown;
    if (!Array.isArray(products)) throw new BadGatewayException('Capture-Pro access could not be verified');
    const product = products.find((candidate): candidate is { id: unknown; code: unknown } => (
      !!candidate && typeof candidate === 'object' && (candidate as { code?: unknown }).code === 'Capture-Pro'
    ));
    if (!product || typeof product.id !== 'string' || !uuidPattern.test(product.id)) {
      throw new ForbiddenException('Capture-Pro is not available for this organisation');
    }
    return product.id;
  }

  private async fetchExtract(
    orgId: string, productId: string, authorization: string, object: 'opportunities' | 'accounts' | 'competitors' | 'bid-budgets',
  ): Promise<unknown> {
    return (await this.fetchExtractBody(orgId, productId, authorization, object)).records;
  }

  private async fetchExtractBody(
    orgId: string, productId: string, authorization: string, object: ExtractObject,
  ): Promise<{ records?: unknown; fields?: unknown }> {
    const serviceKey = this.config.get<string>('CAPTUREPRO_INTERNAL_API_KEY');
    if (!serviceKey) throw new BadGatewayException('Capture-Pro service authentication is not configured');
    const extractPath = object === 'spinergie-vessels' ? 'spinergie/vessels' : object === 'spinergie-charters' ? 'spinergie/charters' : `salesforce/${object}`;
    const provider = object.startsWith('spinergie-') ? 'Spinergie' : 'Salesforce';
    let response: Response;
    try {
      response = await fetch(
        `${this.coreApiUrl}/organisations/${encodeURIComponent(orgId)}/modules/${encodeURIComponent(productId)}/integrations/capture-pro/${extractPath}/extract`,
        {
          method: 'POST',
          headers: { Authorization: authorization, 'X-CapturePro-Service-Key': serviceKey },
          redirect: 'error',
          signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
        },
      );
    } catch {
      throw new BadGatewayException(`${provider} ${object} could not be retrieved from core`);
    }
    if (!response.ok) {
      const body = await response.json().catch(() => null) as { message?: unknown } | null;
      const message = typeof body?.message === 'string' && body.message.length <= 300 ? body.message : undefined;
      if (response.status === 400) throw new BadRequestException(message ?? 'The Salesforce request was rejected');
      if (response.status === 401) throw new UnauthorizedException('Invalid bearer token');
      if (response.status === 403) throw new ForbiddenException(message ?? 'Capture-Pro integration administrator access required');
      if (response.status === 409) throw new ConflictException(message ?? `${provider} integration is not configured`);
      throw new BadGatewayException(message ?? `${provider} ${object} could not be retrieved`);
    }
    const body = await response.json().catch(() => null) as { records?: unknown; fields?: unknown } | null;
    if (!body || typeof body !== 'object') throw new BadGatewayException(`Core returned an invalid ${provider} extract`);
    return body;
  }

  async listSpinergieVessels(orgIdInput: unknown, includeRemoved: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.canView(orgId, user)) throw new ForbiddenException('A Capture-Pro role is required to view Spinergie vessels');
    await this.captureProProductId(orgId, authorization);
    if (includeRemoved !== undefined && includeRemoved !== 'true' && includeRemoved !== 'false') throw new BadRequestException('includeRemoved must be true or false');
    const [vessels, [lastSync]] = await Promise.all([
      this.db.select({
        vesselId: spinergieVessels.vesselId, name: spinergieVessels.name, fields: spinergieVessels.fields,
        inExtract: spinergieVessels.inExtract, lastSeenAt: spinergieVessels.lastSeenAt, removedFromExtractAt: spinergieVessels.removedFromExtractAt,
      }).from(spinergieVessels).where(includeRemoved === 'true' ? eq(spinergieVessels.orgId, orgId)
        : and(eq(spinergieVessels.orgId, orgId), eq(spinergieVessels.inExtract, true))).orderBy(asc(spinergieVessels.name)),
      this.db.select().from(spinergieSyncRuns).where(and(eq(spinergieSyncRuns.orgId, orgId), eq(spinergieSyncRuns.status, 'Succeeded')))
        .orderBy(desc(spinergieSyncRuns.startedAt)).limit(1),
    ]);
    return { vessels, lastSync: lastSync ? this.spinergieRunSummary(lastSync) : null };
  }

  private spinergieRunSummary(run: typeof spinergieSyncRuns.$inferSelect) {
    const { startedByUserId: _startedByUserId, orgId: _orgId, ...summary } = run;
    return summary;
  }

  async spinergieSyncLog(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.canView(orgId, user)) throw new ForbiddenException('A Capture-Pro role is required to view Spinergie sync health');
    await this.captureProProductId(orgId, authorization);
    const runs = await this.db.select().from(spinergieSyncRuns).where(eq(spinergieSyncRuns.orgId, orgId))
      .orderBy(desc(spinergieSyncRuns.startedAt)).limit(SYNC_RUN_LOG_LIMIT);
    return {
      health: salesforceSyncHealth(runs),
      lastRun: runs[0] ? this.spinergieRunSummary(runs[0]) : null,
      runs: runs.map((run) => ({ ...this.spinergieRunSummary(run), startedByCurrentUser: run.startedByUserId === user.id })),
    };
  }

  async syncSpinergieVessels(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.isIntegrationAdministrator(orgId, user)) throw new ForbiddenException('Capture-Pro integration administrator access required');
    const productId = await this.captureProProductId(orgId, authorization);
    const runId = randomUUID();
    const startedAt = new Date();
    let runStarted = false;
    try {
      return await this.db.transaction(async (tx) => {
        const lock = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${`capturepro-spinergie-vessels:${orgId}`})) as locked`);
        if (!lock.rows[0]?.locked) throw new ConflictException('A Spinergie vessel sync is already running for this organisation.');
        runStarted = true;
        const extract = await this.fetchExtractBody(orgId, productId, authorization, 'spinergie-vessels');
        const records = parseSpinergieVessels(extract.records);
        const completedAt = new Date();
        await tx.insert(spinergieSyncRuns).values({ id: runId, orgId, status: 'Succeeded', startedByUserId: user.id, startedAt, completedAt });
        let insertedCount = 0;
        for (let offset = 0; offset < records.length; offset += UPSERT_BATCH_SIZE) {
          const outcomes = await tx.insert(spinergieVessels).values(records.slice(offset, offset + UPSERT_BATCH_SIZE).map((record) => ({
            ...record, orgId, lastSeenAt: completedAt, inExtract: true, removedFromExtractAt: null, lastSyncRunId: runId,
          }))).onConflictDoUpdate({
            target: [spinergieVessels.orgId, spinergieVessels.vesselId],
            set: { name: sql`excluded.name`, fields: sql`excluded.fields`, inExtract: true, lastSeenAt: completedAt, removedFromExtractAt: null, lastSyncRunId: runId },
          }).returning({ inserted: sql<boolean>`(xmax = 0)` });
          insertedCount += outcomes.filter((outcome) => outcome.inserted).length;
        }
        const removed = await tx.update(spinergieVessels).set({ inExtract: false, removedFromExtractAt: completedAt })
          .where(and(eq(spinergieVessels.orgId, orgId), eq(spinergieVessels.inExtract, true), ne(spinergieVessels.lastSyncRunId, runId)))
          .returning({ id: spinergieVessels.id });
        const counts = { receivedCount: records.length, matchedCount: records.length, insertedCount, updatedCount: records.length - insertedCount, removedCount: removed.length };
        const [run] = await tx.update(spinergieSyncRuns).set(counts).where(and(eq(spinergieSyncRuns.id, runId), eq(spinergieSyncRuns.orgId, orgId))).returning();
        await tx.insert(auditEvents).values({ orgId, actorType: 'Human', actorId: user.id, action: 'Spinergie vessel specifications synchronized', details: { runId, ...counts } });
        return this.spinergieRunSummary(run);
      });
    } catch (error: unknown) {
      if (!runStarted) throw error;
      const safeError = error instanceof HttpException ? error : new BadGatewayException('Spinergie vessel specifications could not be stored. Previous vessel data was retained.');
      if (!(safeError instanceof UnauthorizedException)) {
        await this.db.transaction(async (tx) => {
          await tx.insert(spinergieSyncRuns).values({ id: runId, orgId, status: 'Failed', startedByUserId: user.id, startedAt, completedAt: new Date(), errorMessage: safeError.message.slice(0, 500) });
          await tx.insert(auditEvents).values({ orgId, actorType: 'Human', actorId: user.id, action: 'Spinergie vessel sync failed', details: { runId, status: safeError.getStatus() } });
        });
      }
      throw safeError;
    }
  }

  async listSpinergieCharters(orgIdInput: unknown, includeRemoved: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.canView(orgId, user)) throw new ForbiddenException('A Capture-Pro role is required to view Spinergie charters');
    await this.captureProProductId(orgId, authorization);
    if (includeRemoved !== undefined && includeRemoved !== 'true' && includeRemoved !== 'false') throw new BadRequestException('includeRemoved must be true or false');
    const [charters, [lastSync]] = await Promise.all([
      this.db.select({ charterId: spinergieCharters.charterId, vesselId: spinergieCharters.vesselId, name: spinergieCharters.name, fields: spinergieCharters.fields,
        inExtract: spinergieCharters.inExtract, lastSeenAt: spinergieCharters.lastSeenAt, removedFromExtractAt: spinergieCharters.removedFromExtractAt })
        .from(spinergieCharters).where(includeRemoved === 'true' ? eq(spinergieCharters.orgId, orgId)
          : and(eq(spinergieCharters.orgId, orgId), eq(spinergieCharters.inExtract, true)))
        .orderBy(asc(spinergieCharters.name), asc(spinergieCharters.charterId)),
      this.db.select().from(spinergieCharterSyncRuns).where(and(eq(spinergieCharterSyncRuns.orgId, orgId), eq(spinergieCharterSyncRuns.status, 'Succeeded')))
        .orderBy(desc(spinergieCharterSyncRuns.startedAt)).limit(1),
    ]);
    return { charters, lastSync: lastSync ? this.spinergieRunSummary(lastSync) : null };
  }

  async spinergieCharterSyncLog(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.canView(orgId, user)) throw new ForbiddenException('A Capture-Pro role is required to view Spinergie charter sync health');
    await this.captureProProductId(orgId, authorization);
    const runs = await this.db.select().from(spinergieCharterSyncRuns).where(eq(spinergieCharterSyncRuns.orgId, orgId))
      .orderBy(desc(spinergieCharterSyncRuns.startedAt)).limit(SYNC_RUN_LOG_LIMIT);
    return { health: salesforceSyncHealth(runs), lastRun: runs[0] ? this.spinergieRunSummary(runs[0]) : null,
      runs: runs.map((run) => ({ ...this.spinergieRunSummary(run), startedByCurrentUser: run.startedByUserId === user.id })) };
  }

  async syncSpinergieCharters(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.isIntegrationAdministrator(orgId, user)) throw new ForbiddenException('Capture-Pro integration administrator access required');
    const productId = await this.captureProProductId(orgId, authorization);
    const runId = randomUUID();
    const startedAt = new Date();
    let runStarted = false;
    try {
      return await this.db.transaction(async (tx) => {
        const lock = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${`capturepro-spinergie-charters:${orgId}`})) as locked`);
        if (!lock.rows[0]?.locked) throw new ConflictException('A Spinergie charter sync is already running for this organisation.');
        runStarted = true;
        const extract = await this.fetchExtractBody(orgId, productId, authorization, 'spinergie-charters');
        const { records, receivedCount } = parseSpinergieCharters(extract.records);
        const completedAt = new Date();
        await tx.insert(spinergieCharterSyncRuns).values({ id: runId, orgId, status: 'Succeeded', startedByUserId: user.id, startedAt, completedAt });
        let insertedCount = 0;
        for (let offset = 0; offset < records.length; offset += UPSERT_BATCH_SIZE) {
          const outcomes = await tx.insert(spinergieCharters).values(records.slice(offset, offset + UPSERT_BATCH_SIZE).map((record) => ({
            ...record, orgId, lastSeenAt: completedAt, inExtract: true, removedFromExtractAt: null, lastSyncRunId: runId,
          }))).onConflictDoUpdate({ target: [spinergieCharters.orgId, spinergieCharters.charterId],
            set: { name: sql`excluded.name`, fields: sql`excluded.fields`, inExtract: true, lastSeenAt: completedAt, removedFromExtractAt: null, lastSyncRunId: runId },
          }).returning({ inserted: sql<boolean>`(xmax = 0)` });
          insertedCount += outcomes.filter((outcome) => outcome.inserted).length;
        }
        const removed = await tx.update(spinergieCharters).set({ inExtract: false, removedFromExtractAt: completedAt })
          .where(and(eq(spinergieCharters.orgId, orgId), eq(spinergieCharters.inExtract, true), ne(spinergieCharters.lastSyncRunId, runId))).returning({ id: spinergieCharters.id });
        const counts = { receivedCount, matchedCount: records.length, insertedCount, updatedCount: records.length - insertedCount, removedCount: removed.length };
        const [run] = await tx.update(spinergieCharterSyncRuns).set(counts).where(and(eq(spinergieCharterSyncRuns.id, runId), eq(spinergieCharterSyncRuns.orgId, orgId))).returning();
        await tx.insert(auditEvents).values({ orgId, actorType: 'Human', actorId: user.id, action: 'Spinergie vessel charters synchronized', details: { runId, ...counts } });
        return this.spinergieRunSummary(run);
      });
    } catch (error: unknown) {
      if (!runStarted) throw error;
      const safeError = error instanceof HttpException ? error : new BadGatewayException('Spinergie charters could not be stored. Previous charter data was retained.');
      if (!(safeError instanceof UnauthorizedException)) await this.db.transaction(async (tx) => {
        await tx.insert(spinergieCharterSyncRuns).values({ id: runId, orgId, status: 'Failed', startedByUserId: user.id, startedAt, completedAt: new Date(), errorMessage: safeError.message.slice(0, 500) });
        await tx.insert(auditEvents).values({ orgId, actorType: 'Human', actorId: user.id, action: 'Spinergie charter sync failed', details: { runId, status: safeError.getStatus() } });
      });
      throw safeError;
    }
  }

  private async recordFailedRun(orgId: string, user: ProductAuthUser, runId: string, startedAt: Date, objectType: SalesforceObjectType, error: unknown) {
    if (!(error instanceof HttpException) || error instanceof UnauthorizedException) return;
    const label = objectType.toLowerCase();
    await this.db.insert(salesforceSyncRuns).values({
      id: runId, orgId, objectType, status: 'Failed', startedByUserId: user.id, startedAt, completedAt: new Date(), errorMessage: error.message.slice(0, 500),
    });
    await this.db.insert(auditEvents).values({
      orgId, actorType: 'Human', actorId: user.id, action: `Salesforce ${label} sync failed`, details: { runId, status: error.getStatus() },
    });
    this.logger.warn({ action: `Salesforce ${label} sync failed`, orgId, runId, actorId: user.id, status: error.getStatus() });
  }

  private row(orgId: string, runId: string, now: Date, opportunity: TransformedSalesforceOpportunity) {
    const fields = opportunity.fields;
    return {
      orgId,
      salesforceId: fields.Id as string,
      opportunityNumber: fields.Opportunity_Number__c as string,
      opportunityName: textValue(fields.OpportunityName__c),
      accountId: salesforceIdValue(fields.AccountId),
      stageName: textValue(fields.StageName),
      sourceStageName: textValue(opportunity.sourceStageName),
      closeDate: dateValue(fields.CloseDate),
      region: textValue(fields.Region__c),
      country: textValue(fields.Country__c),
      businessLine: textValue(fields.Business_Line__c),
      salesCategory: textValue(fields.SalesCategory__c),
      subCategoryProductType: String(fields.Sub_Category_Product_Type__c),
      productTypeSubCategory: fields.ProductTypeSubCategory,
      priority: textValue(fields.priority__c),
      opportunityOwnerName: textValue(fields.Opportunity_Owner_Name__c),
      forecastedRevenue: numericValue(fields.Forecasted_Revenue__c),
      forecastedGrossProfit: numericValue(fields.Forecasted_Gross_Profit__c),
      totalContractValue: numericValue(fields.Total_Contract_Value_for_all__c),
      fields,
      inExtract: true,
      firstSyncedAt: now,
      lastSeenAt: now,
      removedFromExtractAt: null,
      lastSyncRunId: runId,
      updatedAt: now,
    };
  }

  async sync(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.isIntegrationAdministrator(orgId, user)) throw new ForbiddenException('Capture-Pro integration administrator access required');
    const productId = await this.captureProProductId(orgId, authorization);
    const runId = randomUUID();
    const startedAt = new Date();
    let records: ReturnType<typeof parseSalesforceRecords>;
    try {
      records = parseSalesforceRecords(await this.fetchExtract(orgId, productId, authorization, 'opportunities'));
    } catch (error) {
      await this.recordFailedRun(orgId, user, runId, startedAt, 'Opportunity', error);
      throw error;
    }

    const matched = new Map<string, TransformedSalesforceOpportunity>();
    for (const record of records) {
      if (matchesCaptureProExtract(record)) matched.set(record.Id as string, transformSalesforceOpportunity(record));
    }

    const summary = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`capturepro-salesforce-sync:${orgId}`}))`);
      const completedAt = new Date();
      await tx.insert(salesforceSyncRuns).values({
        id: runId, orgId, objectType: 'Opportunity', status: 'Succeeded', startedByUserId: user.id, startedAt, completedAt,
        receivedCount: records.length, matchedCount: matched.size,
      });
      const rows = [...matched.values()].map((opportunity) => this.row(orgId, runId, completedAt, opportunity));
      let insertedCount = 0;
      for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
        const outcomes = await tx.insert(salesforceOpportunities).values(rows.slice(index, index + UPSERT_BATCH_SIZE))
          .onConflictDoUpdate({
            target: [salesforceOpportunities.orgId, salesforceOpportunities.salesforceId],
            set: {
              opportunityNumber: sql`excluded.opportunity_number`,
              opportunityName: sql`excluded.opportunity_name`,
              accountId: sql`excluded.account_id`,
              stageName: sql`excluded.stage_name`,
              sourceStageName: sql`excluded.source_stage_name`,
              closeDate: sql`excluded.close_date`,
              region: sql`excluded.region`,
              country: sql`excluded.country`,
              businessLine: sql`excluded.business_line`,
              salesCategory: sql`excluded.sales_category`,
              subCategoryProductType: sql`excluded.sub_category_product_type`,
              productTypeSubCategory: sql`excluded.product_type_sub_category`,
              priority: sql`excluded.priority`,
              opportunityOwnerName: sql`excluded.opportunity_owner_name`,
              forecastedRevenue: sql`excluded.forecasted_revenue`,
              forecastedGrossProfit: sql`excluded.forecasted_gross_profit`,
              totalContractValue: sql`excluded.total_contract_value`,
              fields: sql`excluded.fields`,
              inExtract: true,
              lastSeenAt: completedAt,
              removedFromExtractAt: null,
              lastSyncRunId: runId,
              updatedAt: completedAt,
            },
          })
          .returning({ inserted: sql<boolean>`(xmax = 0)` });
        insertedCount += outcomes.filter(({ inserted }) => inserted).length;
      }
      const removed = await tx.update(salesforceOpportunities)
        .set({ inExtract: false, removedFromExtractAt: completedAt, updatedAt: completedAt })
        .where(and(
          eq(salesforceOpportunities.orgId, orgId),
          eq(salesforceOpportunities.inExtract, true),
          ne(salesforceOpportunities.lastSyncRunId, runId),
        ))
        .returning({ id: salesforceOpportunities.id });
      const counts = {
        receivedCount: records.length,
        matchedCount: matched.size,
        insertedCount,
        updatedCount: rows.length - insertedCount,
        removedCount: removed.length,
      };
      await tx.update(salesforceSyncRuns).set(counts).where(eq(salesforceSyncRuns.id, runId));
      await tx.insert(auditEvents).values({
        orgId, actorType: 'Human', actorId: user.id, action: 'Salesforce opportunities synchronized', details: { runId, ...counts },
      });
      return { id: runId, objectType: 'Opportunity' as const, status: 'Succeeded', startedAt, completedAt, errorMessage: null, ...counts };
    });
    const { receivedCount, matchedCount, insertedCount, updatedCount, removedCount } = summary;
    this.logger.log({
      action: 'Salesforce opportunities synchronized', orgId, runId, actorId: user.id,
      receivedCount, matchedCount, insertedCount, updatedCount, removedCount,
    });
    return summary;
  }

  private latestRun(orgId: string, objectType: SalesforceObjectType) {
    return this.db.select().from(salesforceSyncRuns)
      .where(and(eq(salesforceSyncRuns.orgId, orgId), eq(salesforceSyncRuns.objectType, objectType)))
      .orderBy(desc(salesforceSyncRuns.startedAt))
      .limit(1);
  }

  async syncStatus(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.canView(orgId, user)) throw new ForbiddenException('A Capture-Pro role is required to view Salesforce opportunities');
    await this.captureProProductId(orgId, authorization);
    const [lastSync] = await this.latestRun(orgId, 'Opportunity');
    return { lastSync: lastSync ?? null };
  }

  private runLog(orgId: string, objectType?: SalesforceObjectType) {
    return this.db.select({
      id: salesforceSyncRuns.id,
      objectType: salesforceSyncRuns.objectType,
      status: salesforceSyncRuns.status,
      startedByUserId: salesforceSyncRuns.startedByUserId,
      startedAt: salesforceSyncRuns.startedAt,
      completedAt: salesforceSyncRuns.completedAt,
      receivedCount: salesforceSyncRuns.receivedCount,
      matchedCount: salesforceSyncRuns.matchedCount,
      insertedCount: salesforceSyncRuns.insertedCount,
      updatedCount: salesforceSyncRuns.updatedCount,
      removedCount: salesforceSyncRuns.removedCount,
      errorMessage: salesforceSyncRuns.errorMessage,
    }).from(salesforceSyncRuns)
      .where(objectType
        ? and(eq(salesforceSyncRuns.orgId, orgId), eq(salesforceSyncRuns.objectType, objectType))
        : eq(salesforceSyncRuns.orgId, orgId))
      .orderBy(desc(salesforceSyncRuns.startedAt))
      .limit(SYNC_RUN_LOG_LIMIT);
  }

  async syncRuns(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.canView(orgId, user)) throw new ForbiddenException('A Capture-Pro role is required to view Salesforce sync health');
    await this.captureProProductId(orgId, authorization);
    const [rows, opportunityRuns, accountRuns, competitorRuns, bidBudgetRuns, fabricationYardRuns, vesselRuns] = await Promise.all([
      this.runLog(orgId), this.runLog(orgId, 'Opportunity'), this.runLog(orgId, 'Account'), this.runLog(orgId, 'Competitor'),
      this.runLog(orgId, 'Bid Budget'), this.runLog(orgId, 'Fabrication Yard'), this.runLog(orgId, 'Vessel'),
    ]);
    const runs = rows.map(({ startedByUserId, ...run }) => ({ ...run, startedByCurrentUser: startedByUserId === user.id }));
    const latest = (typeRuns: typeof rows) => {
      const [run] = typeRuns;
      if (!run) return null;
      const { startedByUserId, ...rest } = run;
      return { ...rest, startedByCurrentUser: startedByUserId === user.id };
    };
    return {
      health: {
        opportunities: salesforceSyncHealth(opportunityRuns), accounts: salesforceSyncHealth(accountRuns), competitors: salesforceSyncHealth(competitorRuns),
        bidBudgets: salesforceSyncHealth(bidBudgetRuns), fabricationYards: salesforceSyncHealth(fabricationYardRuns),
        vessels: salesforceSyncHealth(vesselRuns),
      },
      lastRuns: {
        opportunities: latest(opportunityRuns), accounts: latest(accountRuns), competitors: latest(competitorRuns), bidBudgets: latest(bidBudgetRuns),
        fabricationYards: latest(fabricationYardRuns), vessels: latest(vesselRuns),
      },
      runs,
    };
  }

  async syncAccounts(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.isIntegrationAdministrator(orgId, user)) throw new ForbiddenException('Capture-Pro integration administrator access required');
    const productId = await this.captureProProductId(orgId, authorization);
    const runId = randomUUID();
    const startedAt = new Date();
    let records: ReturnType<typeof parseSalesforceAccountRecords>;
    try {
      records = parseSalesforceAccountRecords(await this.fetchExtract(orgId, productId, authorization, 'accounts'));
    } catch (error) {
      await this.recordFailedRun(orgId, user, runId, startedAt, 'Account', error);
      throw error;
    }
    const unique = new Map(records.map((record) => [record.Id as string, record]));

    const summary = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`capturepro-salesforce-account-sync:${orgId}`}))`);
      const completedAt = new Date();
      await tx.insert(salesforceSyncRuns).values({
        id: runId, orgId, objectType: 'Account', status: 'Succeeded', startedByUserId: user.id, startedAt, completedAt,
        receivedCount: records.length, matchedCount: unique.size,
      });
      const rows = [...unique.values()].map((record) => ({
        orgId,
        salesforceId: record.Id as string,
        name: textValue(record.Name),
        type: textValue(record.Type),
        companyShortName: textValue(record.Company_Short_Name__c),
        inExtract: true,
        firstSyncedAt: completedAt,
        lastSeenAt: completedAt,
        removedFromExtractAt: null,
        lastSyncRunId: runId,
        updatedAt: completedAt,
      }));
      let insertedCount = 0;
      for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
        const outcomes = await tx.insert(salesforceAccounts).values(rows.slice(index, index + UPSERT_BATCH_SIZE))
          .onConflictDoUpdate({
            target: [salesforceAccounts.orgId, salesforceAccounts.salesforceId],
            set: {
              name: sql`excluded.name`,
              type: sql`excluded.type`,
              companyShortName: sql`excluded.company_short_name`,
              inExtract: true,
              lastSeenAt: completedAt,
              removedFromExtractAt: null,
              lastSyncRunId: runId,
              updatedAt: completedAt,
            },
          })
          .returning({ inserted: sql<boolean>`(xmax = 0)` });
        insertedCount += outcomes.filter(({ inserted }) => inserted).length;
      }
      const removed = await tx.update(salesforceAccounts)
        .set({ inExtract: false, removedFromExtractAt: completedAt, updatedAt: completedAt })
        .where(and(
          eq(salesforceAccounts.orgId, orgId),
          eq(salesforceAccounts.inExtract, true),
          ne(salesforceAccounts.lastSyncRunId, runId),
        ))
        .returning({ id: salesforceAccounts.id });
      const counts = {
        receivedCount: records.length,
        matchedCount: unique.size,
        insertedCount,
        updatedCount: rows.length - insertedCount,
        removedCount: removed.length,
      };
      await tx.update(salesforceSyncRuns).set(counts).where(eq(salesforceSyncRuns.id, runId));
      await tx.insert(auditEvents).values({
        orgId, actorType: 'Human', actorId: user.id, action: 'Salesforce accounts synchronized', details: { runId, ...counts },
      });
      return { id: runId, objectType: 'Account' as const, status: 'Succeeded', startedAt, completedAt, errorMessage: null, ...counts };
    });
    const { receivedCount, matchedCount, insertedCount, updatedCount, removedCount } = summary;
    this.logger.log({
      action: 'Salesforce accounts synchronized', orgId, runId, actorId: user.id,
      receivedCount, matchedCount, insertedCount, updatedCount, removedCount,
    });
    return summary;
  }

  async listAccounts(orgIdInput: unknown, includeRemoved: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.canView(orgId, user)) throw new ForbiddenException('A Capture-Pro role is required to view Salesforce accounts');
    await this.captureProProductId(orgId, authorization);
    const showRemoved = includeRemoved === 'true';
    const [accounts, [lastSync]] = await Promise.all([
      this.db.select({
        id: salesforceAccounts.id,
        salesforceId: salesforceAccounts.salesforceId,
        name: salesforceAccounts.name,
        type: salesforceAccounts.type,
        companyShortName: salesforceAccounts.companyShortName,
        inExtract: salesforceAccounts.inExtract,
        lastSeenAt: salesforceAccounts.lastSeenAt,
        removedFromExtractAt: salesforceAccounts.removedFromExtractAt,
      }).from(salesforceAccounts)
        .where(showRemoved
          ? eq(salesforceAccounts.orgId, orgId)
          : and(eq(salesforceAccounts.orgId, orgId), eq(salesforceAccounts.inExtract, true)))
        .orderBy(asc(salesforceAccounts.name)),
      this.latestRun(orgId, 'Account'),
    ]);
    return { lastSync: lastSync ?? null, accounts };
  }

  async list(orgIdInput: unknown, includeRemoved: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.canView(orgId, user)) throw new ForbiddenException('A Capture-Pro role is required to view Salesforce opportunities');
    await this.captureProProductId(orgId, authorization);
    const showRemoved = includeRemoved === 'true';
    const [opportunities, [lastSync]] = await Promise.all([
      this.db.select({
        id: salesforceOpportunities.id,
        salesforceId: salesforceOpportunities.salesforceId,
        opportunityNumber: salesforceOpportunities.opportunityNumber,
        opportunityName: salesforceOpportunities.opportunityName,
        stageName: salesforceOpportunities.stageName,
        sourceStageName: salesforceOpportunities.sourceStageName,
        closeDate: salesforceOpportunities.closeDate,
        region: salesforceOpportunities.region,
        country: salesforceOpportunities.country,
        businessLine: salesforceOpportunities.businessLine,
        subCategoryProductType: salesforceOpportunities.subCategoryProductType,
        productTypeSubCategory: salesforceOpportunities.productTypeSubCategory,
        priority: salesforceOpportunities.priority,
        opportunityOwnerName: salesforceOpportunities.opportunityOwnerName,
        forecastedRevenue: salesforceOpportunities.forecastedRevenue,
        forecastedGrossProfit: salesforceOpportunities.forecastedGrossProfit,
        totalContractValue: salesforceOpportunities.totalContractValue,
        fields: salesforceOpportunities.fields,
        inExtract: salesforceOpportunities.inExtract,
        lastSeenAt: salesforceOpportunities.lastSeenAt,
        removedFromExtractAt: salesforceOpportunities.removedFromExtractAt,
      }).from(salesforceOpportunities)
        .where(showRemoved
          ? eq(salesforceOpportunities.orgId, orgId)
          : and(eq(salesforceOpportunities.orgId, orgId), eq(salesforceOpportunities.inExtract, true)))
        .orderBy(asc(salesforceOpportunities.opportunityNumber)),
      this.latestRun(orgId, 'Opportunity'),
    ]);
    return { lastSync: lastSync ?? null, opportunities };
  }

  async syncCompetitors(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.isIntegrationAdministrator(orgId, user)) throw new ForbiddenException('Capture-Pro integration administrator access required');
    const productId = await this.captureProProductId(orgId, authorization);
    const runId = randomUUID();
    const startedAt = new Date();
    let records: ReturnType<typeof parseSalesforceCompetitorRecords>;
    try {
      records = parseSalesforceCompetitorRecords(await this.fetchExtract(orgId, productId, authorization, 'competitors'));
    } catch (error) {
      await this.recordFailedRun(orgId, user, runId, startedAt, 'Competitor', error);
      throw error;
    }
    const unique = new Map(records.map((record) => [record.Id as string, record]));

    const summary = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`capturepro-salesforce-competitor-sync:${orgId}`}))`);
      const completedAt = new Date();
      await tx.insert(salesforceSyncRuns).values({
        id: runId, orgId, objectType: 'Competitor', status: 'Succeeded', startedByUserId: user.id, startedAt, completedAt,
        receivedCount: records.length, matchedCount: unique.size,
      });
      const rows = [...unique.values()].map((record) => ({
        orgId,
        salesforceId: record.Id as string,
        competitorName: textValue(record.Competitor_Name__c),
        competitorAccountId: salesforceIdValue(record.Competitor__c),
        opportunitySalesforceId: salesforceIdValue(record.Opportunity__c),
        bidPrice: numericValue(record.Competitor_s_Bid_Price__c),
        fields: record,
        inExtract: true,
        firstSyncedAt: completedAt,
        lastSeenAt: completedAt,
        removedFromExtractAt: null,
        lastSyncRunId: runId,
        updatedAt: completedAt,
      }));
      let insertedCount = 0;
      for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
        const outcomes = await tx.insert(salesforceCompetitors).values(rows.slice(index, index + UPSERT_BATCH_SIZE))
          .onConflictDoUpdate({
            target: [salesforceCompetitors.orgId, salesforceCompetitors.salesforceId],
            set: {
              competitorName: sql`excluded.competitor_name`,
              competitorAccountId: sql`excluded.competitor_account_id`,
              opportunitySalesforceId: sql`excluded.opportunity_salesforce_id`,
              bidPrice: sql`excluded.bid_price`,
              fields: sql`excluded.fields`,
              inExtract: true,
              lastSeenAt: completedAt,
              removedFromExtractAt: null,
              lastSyncRunId: runId,
              updatedAt: completedAt,
            },
          })
          .returning({ inserted: sql<boolean>`(xmax = 0)` });
        insertedCount += outcomes.filter(({ inserted }) => inserted).length;
      }
      const removed = await tx.update(salesforceCompetitors)
        .set({ inExtract: false, removedFromExtractAt: completedAt, updatedAt: completedAt })
        .where(and(
          eq(salesforceCompetitors.orgId, orgId),
          eq(salesforceCompetitors.inExtract, true),
          ne(salesforceCompetitors.lastSyncRunId, runId),
        ))
        .returning({ id: salesforceCompetitors.id });
      const counts = {
        receivedCount: records.length,
        matchedCount: unique.size,
        insertedCount,
        updatedCount: rows.length - insertedCount,
        removedCount: removed.length,
      };
      await tx.update(salesforceSyncRuns).set(counts).where(eq(salesforceSyncRuns.id, runId));
      await tx.insert(auditEvents).values({
        orgId, actorType: 'Human', actorId: user.id, action: 'Salesforce competitors synchronized', details: { runId, ...counts },
      });
      return { id: runId, objectType: 'Competitor' as const, status: 'Succeeded', startedAt, completedAt, errorMessage: null, ...counts };
    });
    const { receivedCount, matchedCount, insertedCount, updatedCount, removedCount } = summary;
    this.logger.log({
      action: 'Salesforce competitors synchronized', orgId, runId, actorId: user.id,
      receivedCount, matchedCount, insertedCount, updatedCount, removedCount,
    });
    return summary;
  }

  async listCompetitors(orgIdInput: unknown, includeRemoved: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.canView(orgId, user)) throw new ForbiddenException('A Capture-Pro role is required to view Salesforce competitors');
    await this.captureProProductId(orgId, authorization);
    const showRemoved = includeRemoved === 'true';
    const linkedOpportunity = alias(salesforceOpportunities, 'linked_opportunity');
    const linkedAccount = alias(salesforceAccounts, 'linked_account');
    // Linked names come only from records synced for the same organisation.
    const [competitors, [lastSync]] = await Promise.all([
      this.db.select({
        id: salesforceCompetitors.id,
        salesforceId: salesforceCompetitors.salesforceId,
        fields: salesforceCompetitors.fields,
        competitorAccountId: salesforceCompetitors.competitorAccountId,
        competitorAccountName: linkedAccount.name,
        opportunitySalesforceId: salesforceCompetitors.opportunitySalesforceId,
        opportunityNumber: linkedOpportunity.opportunityNumber,
        opportunityName: linkedOpportunity.opportunityName,
        inExtract: salesforceCompetitors.inExtract,
        lastSeenAt: salesforceCompetitors.lastSeenAt,
        removedFromExtractAt: salesforceCompetitors.removedFromExtractAt,
      }).from(salesforceCompetitors)
        .leftJoin(linkedOpportunity, and(
          eq(linkedOpportunity.orgId, salesforceCompetitors.orgId),
          eq(linkedOpportunity.salesforceId, salesforceCompetitors.opportunitySalesforceId),
        ))
        .leftJoin(linkedAccount, and(
          eq(linkedAccount.orgId, salesforceCompetitors.orgId),
          eq(linkedAccount.salesforceId, salesforceCompetitors.competitorAccountId),
        ))
        .where(showRemoved
          ? eq(salesforceCompetitors.orgId, orgId)
          : and(eq(salesforceCompetitors.orgId, orgId), eq(salesforceCompetitors.inExtract, true)))
        .orderBy(asc(salesforceCompetitors.competitorName)),
      this.latestRun(orgId, 'Competitor'),
    ]);
    return { lastSync: lastSync ?? null, competitors };
  }

  async syncBidBudgets(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.isIntegrationAdministrator(orgId, user)) throw new ForbiddenException('Capture-Pro integration administrator access required');
    const productId = await this.captureProProductId(orgId, authorization);
    const runId = randomUUID();
    const startedAt = new Date();
    let records: ReturnType<typeof parseSalesforceBidBudgetRecords>;
    try {
      records = parseSalesforceBidBudgetRecords(await this.fetchExtract(orgId, productId, authorization, 'bid-budgets'));
    } catch (error) {
      await this.recordFailedRun(orgId, user, runId, startedAt, 'Bid Budget', error);
      throw error;
    }
    const unique = new Map(records.map((record) => [record.Id as string, record]));

    const summary = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`capturepro-salesforce-bid-budget-sync:${orgId}`}))`);
      const completedAt = new Date();
      await tx.insert(salesforceSyncRuns).values({
        id: runId, orgId, objectType: 'Bid Budget', status: 'Succeeded', startedByUserId: user.id, startedAt, completedAt,
        receivedCount: records.length, matchedCount: unique.size,
      });
      const rows = [...unique.values()].map((record) => ({
        orgId,
        salesforceId: record.Id as string,
        opportunitySalesforceId: salesforceIdValue(record.Opportunity__c),
        fields: record,
        inExtract: true,
        firstSyncedAt: completedAt,
        lastSeenAt: completedAt,
        removedFromExtractAt: null,
        lastSyncRunId: runId,
        updatedAt: completedAt,
      }));
      let insertedCount = 0;
      for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
        const outcomes = await tx.insert(salesforceBidBudgets).values(rows.slice(index, index + UPSERT_BATCH_SIZE))
          .onConflictDoUpdate({
            target: [salesforceBidBudgets.orgId, salesforceBidBudgets.salesforceId],
            set: {
              opportunitySalesforceId: sql`excluded.opportunity_salesforce_id`,
              fields: sql`excluded.fields`,
              inExtract: true,
              lastSeenAt: completedAt,
              removedFromExtractAt: null,
              lastSyncRunId: runId,
              updatedAt: completedAt,
            },
          })
          .returning({ inserted: sql<boolean>`(xmax = 0)` });
        insertedCount += outcomes.filter(({ inserted }) => inserted).length;
      }
      const removed = await tx.update(salesforceBidBudgets)
        .set({ inExtract: false, removedFromExtractAt: completedAt, updatedAt: completedAt })
        .where(and(
          eq(salesforceBidBudgets.orgId, orgId),
          eq(salesforceBidBudgets.inExtract, true),
          ne(salesforceBidBudgets.lastSyncRunId, runId),
        ))
        .returning({ id: salesforceBidBudgets.id });
      const counts = {
        receivedCount: records.length,
        matchedCount: unique.size,
        insertedCount,
        updatedCount: rows.length - insertedCount,
        removedCount: removed.length,
      };
      await tx.update(salesforceSyncRuns).set(counts).where(eq(salesforceSyncRuns.id, runId));
      await tx.insert(auditEvents).values({
        orgId, actorType: 'Human', actorId: user.id, action: 'Salesforce bid budgets synchronized', details: { runId, ...counts },
      });
      return { id: runId, objectType: 'Bid Budget' as const, status: 'Succeeded', startedAt, completedAt, errorMessage: null, ...counts };
    });
    const { receivedCount, matchedCount, insertedCount, updatedCount, removedCount } = summary;
    this.logger.log({
      action: 'Salesforce bid budgets synchronized', orgId, runId, actorId: user.id,
      receivedCount, matchedCount, insertedCount, updatedCount, removedCount,
    });
    return summary;
  }

  async listBidBudgets(orgIdInput: unknown, includeRemoved: unknown, user: ProductAuthUser, authorization: string) {
    const orgId = this.organisation(orgIdInput, user);
    if (!this.canView(orgId, user)) throw new ForbiddenException('A Capture-Pro role is required to view Salesforce bid budget data');
    await this.captureProProductId(orgId, authorization);
    const showRemoved = includeRemoved === 'true';
    const linkedOpportunity = alias(salesforceOpportunities, 'linked_opportunity');
    // Linked names come only from opportunities synced for the same organisation.
    const [bidBudgets, [lastSync]] = await Promise.all([
      this.db.select({
        id: salesforceBidBudgets.id,
        salesforceId: salesforceBidBudgets.salesforceId,
        fields: salesforceBidBudgets.fields,
        opportunitySalesforceId: salesforceBidBudgets.opportunitySalesforceId,
        opportunityNumber: linkedOpportunity.opportunityNumber,
        opportunityName: linkedOpportunity.opportunityName,
        inExtract: salesforceBidBudgets.inExtract,
        lastSeenAt: salesforceBidBudgets.lastSeenAt,
        removedFromExtractAt: salesforceBidBudgets.removedFromExtractAt,
      }).from(salesforceBidBudgets)
        .leftJoin(linkedOpportunity, and(
          eq(linkedOpportunity.orgId, salesforceBidBudgets.orgId),
          eq(linkedOpportunity.salesforceId, salesforceBidBudgets.opportunitySalesforceId),
        ))
        .where(showRemoved
          ? eq(salesforceBidBudgets.orgId, orgId)
          : and(eq(salesforceBidBudgets.orgId, orgId), eq(salesforceBidBudgets.inExtract, true)))
        .orderBy(asc(salesforceBidBudgets.opportunitySalesforceId), asc(salesforceBidBudgets.salesforceId)),
      this.latestRun(orgId, 'Bid Budget'),
    ]);
    return { lastSync: lastSync ?? null, bidBudgets };
  }

  syncFabricationYards(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    return this.syncDescribedObject('fabricationYards', orgIdInput, user, authorization);
  }

  async listFabricationYards(orgIdInput: unknown, includeRemoved: unknown, user: ProductAuthUser, authorization: string) {
    const { records, ...rest } = await this.listDescribedObject('fabricationYards', orgIdInput, includeRemoved, user, authorization);
    return { ...rest, fabricationYards: records };
  }

  syncVessels(orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    return this.syncDescribedObject('vessels', orgIdInput, user, authorization);
  }

  async listVessels(orgIdInput: unknown, includeRemoved: unknown, user: ProductAuthUser, authorization: string) {
    const { records, ...rest } = await this.listDescribedObject('vessels', orgIdInput, includeRemoved, user, authorization);
    return { ...rest, vessels: records };
  }

  private async syncDescribedObject(key: DescribedObjectKey, orgIdInput: unknown, user: ProductAuthUser, authorization: string) {
    const { table, objectName, objectType, extract: extractObject, label, plural } = describedObjects[key];
    const orgId = this.organisation(orgIdInput, user);
    if (!this.isIntegrationAdministrator(orgId, user)) throw new ForbiddenException('Capture-Pro integration administrator access required');
    const productId = await this.captureProProductId(orgId, authorization);
    const runId = randomUUID();
    const startedAt = new Date();
    let extract: ReturnType<typeof parseSalesforceDescribedExtract>;
    try {
      extract = parseSalesforceDescribedExtract(await this.fetchExtractBody(orgId, productId, authorization, extractObject), `Salesforce ${label}`);
    } catch (error) {
      await this.recordFailedRun(orgId, user, runId, startedAt, objectType, error);
      throw error;
    }
    const { fields, records } = extract;
    const unique = new Map(records.map((record) => [record.Id as string, record]));

    const summary = await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`capturepro-salesforce-${label.replace(/ /g, '-')}-sync:${orgId}`}))`);
      const completedAt = new Date();
      await tx.insert(salesforceSyncRuns).values({
        id: runId, orgId, objectType, status: 'Succeeded', startedByUserId: user.id, startedAt, completedAt,
        receivedCount: records.length, matchedCount: unique.size,
      });
      await tx.insert(salesforceObjectFields).values({ orgId, objectName, fields, lastSyncRunId: runId, updatedAt: completedAt })
        .onConflictDoUpdate({
          target: [salesforceObjectFields.orgId, salesforceObjectFields.objectName],
          set: { fields: sql`excluded.fields`, lastSyncRunId: runId, updatedAt: completedAt },
        })
        .returning({ id: salesforceObjectFields.id });
      const rows = [...unique.values()].map((record) => ({
        orgId,
        salesforceId: record.Id as string,
        name: textValue(record.Name),
        fields: record,
        inExtract: true,
        firstSyncedAt: completedAt,
        lastSeenAt: completedAt,
        removedFromExtractAt: null,
        lastSyncRunId: runId,
        updatedAt: completedAt,
      }));
      let insertedCount = 0;
      for (let index = 0; index < rows.length; index += UPSERT_BATCH_SIZE) {
        const outcomes = await tx.insert(table).values(rows.slice(index, index + UPSERT_BATCH_SIZE))
          .onConflictDoUpdate({
            target: [table.orgId, table.salesforceId],
            set: {
              name: sql`excluded.name`,
              fields: sql`excluded.fields`,
              inExtract: true,
              lastSeenAt: completedAt,
              removedFromExtractAt: null,
              lastSyncRunId: runId,
              updatedAt: completedAt,
            },
          })
          .returning({ inserted: sql<boolean>`(xmax = 0)` });
        insertedCount += outcomes.filter(({ inserted }) => inserted).length;
      }
      const removed = await tx.update(table)
        .set({ inExtract: false, removedFromExtractAt: completedAt, updatedAt: completedAt })
        .where(and(eq(table.orgId, orgId), eq(table.inExtract, true), ne(table.lastSyncRunId, runId)))
        .returning({ id: table.id });
      const counts = {
        receivedCount: records.length,
        matchedCount: unique.size,
        insertedCount,
        updatedCount: rows.length - insertedCount,
        removedCount: removed.length,
      };
      await tx.update(salesforceSyncRuns).set(counts).where(eq(salesforceSyncRuns.id, runId));
      await tx.insert(auditEvents).values({
        orgId, actorType: 'Human', actorId: user.id, action: `Salesforce ${plural} synchronized`, details: { runId, fieldCount: fields.length, ...counts },
      });
      return { id: runId, objectType, status: 'Succeeded', startedAt, completedAt, errorMessage: null, ...counts };
    });
    const { receivedCount, matchedCount, insertedCount, updatedCount, removedCount } = summary;
    this.logger.log({
      action: `Salesforce ${plural} synchronized`, orgId, runId, actorId: user.id, fieldCount: fields.length,
      receivedCount, matchedCount, insertedCount, updatedCount, removedCount,
    });
    return summary;
  }

  private async listDescribedObject(key: DescribedObjectKey, orgIdInput: unknown, includeRemoved: unknown, user: ProductAuthUser, authorization: string) {
    const { table, objectName, objectType, plural } = describedObjects[key];
    const orgId = this.organisation(orgIdInput, user);
    if (!this.canView(orgId, user)) throw new ForbiddenException(`A Capture-Pro role is required to view Salesforce ${plural}`);
    await this.captureProProductId(orgId, authorization);
    const showRemoved = includeRemoved === 'true';
    const [records, [definitions], [lastSync]] = await Promise.all([
      this.db.select({
        id: table.id,
        salesforceId: table.salesforceId,
        name: table.name,
        fields: table.fields,
        inExtract: table.inExtract,
        lastSeenAt: table.lastSeenAt,
        removedFromExtractAt: table.removedFromExtractAt,
      }).from(table)
        .where(showRemoved ? eq(table.orgId, orgId) : and(eq(table.orgId, orgId), eq(table.inExtract, true)))
        .orderBy(asc(table.name), asc(table.salesforceId)),
      this.db.select({ fields: salesforceObjectFields.fields }).from(salesforceObjectFields)
        .where(and(eq(salesforceObjectFields.orgId, orgId), eq(salesforceObjectFields.objectName, objectName)))
        .orderBy(asc(salesforceObjectFields.objectName)),
      this.latestRun(orgId, objectType),
    ]);
    return { lastSync: lastSync ?? null, objectName, fieldDefinitions: definitions?.fields ?? [], records };
  }
}
