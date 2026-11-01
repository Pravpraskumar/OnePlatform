import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { ProductAuthUser } from './auth/product-auth.guard';
import { CAPTURE_PRO_DB } from './db/database.module';
import type { CaptureProDb } from './db';
import { agentRuns, auditEvents, capturePlans, dataSets, opportunities, planSections, planVersions, sourceDocuments } from './db/schema';

const tg3Source = 'TG3 - Build and Test Plan';
const tg3DataSets = [
  ['structured-data', '1.0 Data', 'Structured extracts and reference', 15, 'On controlled file change'],
  ['capture-plans', '2.0 Sample Capture Plans', 'Historical capture plans and precedent', 56, 'Per bid close-out'],
  ['itt-documents', '3.0 Sample ITT Documents', 'Client ITT, SOW, schedule, and annex packs', 40, 'Per ITT revision'],
  ['market-intelligence', '4.0 Sample Subscriptions', 'Licensed market intelligence and vessel reports', 377, 'Four times daily'],
  ['test-data', 'Test Dataset 2nd Cut', 'Pursuit-aligned ITT, SOW, schedule, CA, and CP files', 116, 'Per test-data release'],
  ['competitor-analysis', 'Competitor analyses', 'Competitor analysis workbooks by pursuit', 20, 'Per pursuit review'],
  ['requirements', 'Data requirements', 'CIS data and test-data requirements', 2, 'Per governance revision'],
  ['tg3-gate-pack', 'TG3 gate pack', 'Commercial Intelligence tollgate material', 2, 'Per gate review'],
] as const;

const capturePlanSections = [
  ['CP-01', 'Project Overview', 'Capture Strategy'], ['CP-02', 'Field Layout', 'Capture Strategy'],
  ['CP-03', 'Zippering Plan', 'Capture Strategy'], ['CP-04', 'Field Schematic & MTO', 'Capture Strategy'],
  ['CP-05', 'Marine Execution Plan', 'Vessel Matching'], ['CP-06', 'Procurement & Subcontract Plan', 'Capture Strategy'],
  ['CP-07', 'Proposed Contracting Strategy', 'Capture Strategy'], ['CP-08', 'Project Execution Strategy', 'Capture Strategy'],
  ['CP-09', 'Execution Plan', 'Capture Strategy'], ['CP-10', 'Project Schedule', 'Scenario Modeling'],
  ['CP-11', 'Logistics', 'Capture Strategy'], ['CP-12', 'Competitor SWOT', 'Competitor SWOT'],
  ['CP-13', 'Competitor Schedule', 'Vessel Matching'], ['CP-14', 'Local Content Requirements', 'Capture Strategy'],
] as const;

const sectionStatuses = ['Waiting', 'Generated', 'Needs Input', 'Accepted'] as const;
type SectionStatus = typeof sectionStatuses[number];
const agentNames = ['Vessel Matching', 'Competitor SWOT', 'Capture Strategy', 'Scenario Modeling', 'Bid Review'] as const;
type AgentName = typeof agentNames[number];
const planTransitions = {
  Draft: ['In Review'],
  'In Review': ['Draft', 'Authorised'],
  Authorised: ['Archived'],
  Archived: [],
} as const;
type PlanStatus = keyof typeof planTransitions;

@Injectable()
export class CaptureProService {
  constructor(@Inject(CAPTURE_PRO_DB) private readonly db: CaptureProDb) {}

  private assertOrgAccess(orgId: string, user: ProductAuthUser) {
    if (!user.organisations.some((organisation) => organisation.id === orgId)) {
      throw new ForbiddenException('Active organisation membership required');
    }
  }

  private requireText(value: unknown, label: string, maxLength: number) {
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
      throw new BadRequestException(`${label} is required`);
    }
    return value.trim();
  }

  private isAdministrator(orgId: string, user: ProductAuthUser) {
    return user.globalRoles.includes('Global Administrator')
      || user.organisations.some((organisation) => organisation.id === orgId && (organisation.membership === 'Owner' || organisation.membership === 'Admin'));
  }

  private async ensureDataSets(orgId: string) {
    for (const [key, name, description, itemCount, freshnessPolicy] of tg3DataSets) {
      await this.db.insert(dataSets).values({
        orgId, key, name, category: 'TG3', description, itemCount, freshnessPolicy, sourceLocation: tg3Source,
      }).onConflictDoNothing({ target: [dataSets.orgId, dataSets.key] });
    }
  }

  async overview(orgId: string, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    await this.ensureDataSets(orgId);
    const [[opportunityCount], [planCount], [dataSetSummary], recentOpportunities] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)::int` }).from(opportunities).where(eq(opportunities.orgId, orgId)),
      this.db.select({ count: sql<number>`count(*)::int` }).from(capturePlans).where(eq(capturePlans.orgId, orgId)),
      this.db.select({ count: sql<number>`count(*)::int`, items: sql<number>`coalesce(sum(${dataSets.itemCount}), 0)::int` }).from(dataSets).where(eq(dataSets.orgId, orgId)),
      this.db.select().from(opportunities).where(eq(opportunities.orgId, orgId)).orderBy(desc(opportunities.updatedAt)).limit(5),
    ]);
    return { opportunityCount: opportunityCount.count, planCount: planCount.count, dataSetCount: dataSetSummary.count, sourceItemCount: dataSetSummary.items, recentOpportunities };
  }

  async listOpportunities(orgId: string, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    return this.db.select().from(opportunities).where(eq(opportunities.orgId, orgId)).orderBy(desc(opportunities.updatedAt));
  }

  async createOpportunity(orgId: string, input: Record<string, unknown>, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    const opportunityNumber = this.requireText(input.opportunityNumber, 'Opportunity number', 80);
    const [existing] = await this.db.select({ id: opportunities.id }).from(opportunities).where(and(eq(opportunities.orgId, orgId), eq(opportunities.opportunityNumber, opportunityNumber)));
    if (existing) throw new ConflictException('Opportunity number already exists');
    const competitors = Array.isArray(input.competitors)
      ? input.competitors.filter((value): value is string => typeof value === 'string').map((value) => value.trim()).filter(Boolean).slice(0, 30)
      : [];
    const [created] = await this.db.insert(opportunities).values({
      orgId,
      projectId: typeof input.projectId === 'string' && input.projectId ? input.projectId : null,
      opportunityNumber,
      name: this.requireText(input.name, 'Opportunity name', 300),
      client: this.requireText(input.client, 'Client', 240),
      region: this.requireText(input.region, 'Region', 200),
      businessLine: typeof input.businessLine === 'string' ? input.businessLine.trim().slice(0, 160) || null : null,
      scopeType: typeof input.scopeType === 'string' ? input.scopeType.trim().slice(0, 100) || null : null,
      campaignWindow: typeof input.campaignWindow === 'string' ? input.campaignWindow.trim().slice(0, 80) || null : null,
      estimatedValueUsdMillions: Number.isInteger(input.estimatedValueUsdMillions) && Number(input.estimatedValueUsdMillions) >= 0 ? Number(input.estimatedValueUsdMillions) : null,
      waterDepthMetres: Number.isInteger(input.waterDepthMetres) && Number(input.waterDepthMetres) >= 0 ? Number(input.waterDepthMetres) : null,
      scopeSummary: typeof input.scopeSummary === 'string' ? input.scopeSummary.trim() || null : null,
      commercialConstraints: typeof input.commercialConstraints === 'string' ? input.commercialConstraints.trim() || null : null,
      competitors,
      createdByUserId: user.id,
    }).returning();
    await this.db.insert(auditEvents).values({ orgId, opportunityId: created.id, actorType: 'Human', actorId: user.id, action: 'Opportunity created', details: { opportunityNumber } });
    return created;
  }

  async listDataSets(orgId: string, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    await this.ensureDataSets(orgId);
    return this.db.select().from(dataSets).where(eq(dataSets.orgId, orgId)).orderBy(dataSets.name);
  }

  async listSourceDocuments(orgId: string, dataSetId: string, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    const [dataSet] = await this.db.select({ id: dataSets.id }).from(dataSets)
      .where(and(eq(dataSets.id, dataSetId), eq(dataSets.orgId, orgId)));
    if (!dataSet) throw new NotFoundException('Data set not found');
    return this.db.select().from(sourceDocuments)
      .where(and(eq(sourceDocuments.orgId, orgId), eq(sourceDocuments.dataSetId, dataSetId)))
      .orderBy(desc(sourceDocuments.createdAt));
  }

  async createSourceDocument(orgId: string, dataSetId: string, input: Record<string, unknown>, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    const [dataSet] = await this.db.select({ id: dataSets.id }).from(dataSets)
      .where(and(eq(dataSets.id, dataSetId), eq(dataSets.orgId, orgId)));
    if (!dataSet) throw new NotFoundException('Data set not found');

    const opportunityId = typeof input.opportunityId === 'string' && input.opportunityId ? input.opportunityId : null;
    if (opportunityId) {
      const [opportunity] = await this.db.select({ id: opportunities.id }).from(opportunities)
        .where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
      if (!opportunity) throw new NotFoundException('Opportunity not found');
    }

    let sourceUrl: string | null = null;
    if (typeof input.sourceUrl === 'string' && input.sourceUrl.trim()) {
      try {
        const parsed = new URL(input.sourceUrl.trim());
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error();
        sourceUrl = parsed.toString();
      } catch {
        throw new BadRequestException('Source URL must be an HTTPS URL without embedded credentials');
      }
    }

    let asOfDate: Date | null = null;
    if (typeof input.asOfDate === 'string' && input.asOfDate) {
      asOfDate = new Date(input.asOfDate);
      if (Number.isNaN(asOfDate.getTime())) throw new BadRequestException('As-of date must be a valid date');
    }

    const metadata = input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? input.metadata as Record<string, unknown>
      : {};
    if (JSON.stringify(metadata).length > 20_000) throw new BadRequestException('Document metadata is too large');

    const [created] = await this.db.insert(sourceDocuments).values({
      orgId,
      dataSetId,
      opportunityId,
      fileName: this.requireText(input.fileName, 'File name', 500),
      documentType: this.requireText(input.documentType, 'Document type', 100),
      sourceUrl,
      asOfDate,
      metadata,
    }).returning();
    await this.db.insert(auditEvents).values({
      orgId,
      opportunityId,
      actorType: 'Human',
      actorId: user.id,
      action: 'Source document registered',
      details: { sourceDocumentId: created.id, dataSetId, fileName: created.fileName },
    });
    return created;
  }

  async listPlans(orgId: string, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    return this.db.select({ plan: capturePlans, opportunity: opportunities }).from(capturePlans)
      .innerJoin(opportunities, eq(opportunities.id, capturePlans.opportunityId))
      .where(eq(capturePlans.orgId, orgId)).orderBy(desc(capturePlans.updatedAt));
  }

  async createPlan(orgId: string, opportunityId: string, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    const [opportunity] = await this.db.select().from(opportunities).where(and(eq(opportunities.id, opportunityId), eq(opportunities.orgId, orgId)));
    if (!opportunity) throw new NotFoundException('Opportunity not found');
    return this.db.transaction(async (tx) => {
      const [plan] = await tx.insert(capturePlans).values({ orgId, opportunityId, title: `${opportunity.opportunityNumber} - ${opportunity.name}`, createdByUserId: user.id }).returning();
      const [version] = await tx.insert(planVersions).values({ planId: plan.id, version: 1, changeSummary: 'Initial capture plan commissioned', createdByUserId: user.id }).returning();
      await tx.insert(planSections).values(capturePlanSections.map(([code, title, owningAgent], index) => ({ versionId: version.id, code, title, owningAgent, displayOrder: index + 1 })));
      await tx.insert(auditEvents).values({ orgId, opportunityId, planId: plan.id, actorType: 'Human', actorId: user.id, action: 'Capture plan commissioned', details: { version: 1 } });
      return plan;
    }).catch((error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === '23505') throw new ConflictException('A capture plan already exists for this opportunity');
      throw error;
    });
  }

  async listPlanSourceDocuments(orgId: string, planId: string, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    const [plan] = await this.db.select({ opportunityId: capturePlans.opportunityId }).from(capturePlans)
      .where(and(eq(capturePlans.id, planId), eq(capturePlans.orgId, orgId)));
    if (!plan) throw new NotFoundException('Capture plan not found');
    return this.db.select().from(sourceDocuments).where(and(
      eq(sourceDocuments.orgId, orgId),
      or(isNull(sourceDocuments.opportunityId), eq(sourceDocuments.opportunityId, plan.opportunityId)),
    )).orderBy(desc(sourceDocuments.createdAt));
  }

  async getPlan(orgId: string, planId: string, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    const [plan] = await this.db.select({ plan: capturePlans, opportunity: opportunities }).from(capturePlans)
      .innerJoin(opportunities, eq(opportunities.id, capturePlans.opportunityId))
      .where(and(eq(capturePlans.id, planId), eq(capturePlans.orgId, orgId)));
    if (!plan) throw new NotFoundException('Capture plan not found');
    const [version] = await this.db.select().from(planVersions).where(and(eq(planVersions.planId, planId), eq(planVersions.version, plan.plan.currentVersion)));
    const [sections, runs, events] = await Promise.all([
      this.db.select().from(planSections).where(eq(planSections.versionId, version.id)).orderBy(planSections.displayOrder),
      this.db.select().from(agentRuns).where(and(eq(agentRuns.orgId, orgId), eq(agentRuns.planId, planId))).orderBy(desc(agentRuns.createdAt)),
      this.db.select().from(auditEvents).where(and(eq(auditEvents.orgId, orgId), eq(auditEvents.planId, planId))).orderBy(desc(auditEvents.createdAt)),
    ]);
    return { ...plan, version, sections, runs, auditEvents: events };
  }

  async updatePlanSection(orgId: string, planId: string, sectionCode: string, input: Record<string, unknown>, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    const [plan] = await this.db.select().from(capturePlans)
      .where(and(eq(capturePlans.id, planId), eq(capturePlans.orgId, orgId)));
    if (!plan) throw new NotFoundException('Capture plan not found');
    if (plan.status === 'Authorised' || plan.status === 'Archived') {
      throw new ConflictException('Authorised or archived capture plans cannot be edited');
    }
    const [version] = await this.db.select().from(planVersions)
      .where(and(eq(planVersions.planId, planId), eq(planVersions.version, plan.currentVersion)));
    if (!version) throw new NotFoundException('Current plan version not found');
    const code = sectionCode.toUpperCase();
    const [section] = await this.db.select().from(planSections)
      .where(and(eq(planSections.versionId, version.id), eq(planSections.code, code)));
    if (!section) throw new NotFoundException('Plan section not found');

    const status = input.status;
    if (typeof status !== 'string' || !sectionStatuses.includes(status as SectionStatus)) {
      throw new BadRequestException('Section status is invalid');
    }
    const content = input.content && typeof input.content === 'object' && !Array.isArray(input.content)
      ? input.content as Record<string, unknown>
      : {};
    if (JSON.stringify(content).length > 100_000) throw new BadRequestException('Section content is too large');
    if (!Array.isArray(input.citations) || input.citations.length > 100) throw new BadRequestException('Citations must be an array with at most 100 entries');
    const citations = input.citations.map((citation) => {
      if (!citation || typeof citation !== 'object' || Array.isArray(citation)) throw new BadRequestException('Citation is invalid');
      const value = citation as Record<string, unknown>;
      const label = this.requireText(value.label, 'Citation label', 500);
      return { label, ...(typeof value.sourceDocumentId === 'string' && value.sourceDocumentId ? { sourceDocumentId: value.sourceDocumentId } : {}) };
    });
    const sourceDocumentIds = [...new Set(citations.flatMap((citation) => citation.sourceDocumentId ? [citation.sourceDocumentId] : []))];
    if (sourceDocumentIds.length) {
      const documents = await this.db.select({ id: sourceDocuments.id }).from(sourceDocuments)
        .where(and(eq(sourceDocuments.orgId, orgId), inArray(sourceDocuments.id, sourceDocumentIds)));
      if (documents.length !== sourceDocumentIds.length) throw new BadRequestException('A citation references an unavailable source document');
    }

    const [updated] = await this.db.update(planSections).set({ content, citations, status: status as SectionStatus, updatedAt: new Date() })
      .where(eq(planSections.id, section.id)).returning();
    await this.db.insert(auditEvents).values({
      orgId,
      opportunityId: plan.opportunityId,
      planId,
      actorType: 'Human',
      actorId: user.id,
      action: 'Capture plan section updated',
      details: { version: version.version, sectionCode: code, status },
    });
    return updated;
  }

  async createPlanVersion(orgId: string, planId: string, changeSummaryInput: unknown, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    const changeSummary = this.requireText(changeSummaryInput, 'Change summary', 2_000);
    return this.db.transaction(async (tx) => {
      const [plan] = await tx.select().from(capturePlans)
        .where(and(eq(capturePlans.id, planId), eq(capturePlans.orgId, orgId))).for('update');
      if (!plan) throw new NotFoundException('Capture plan not found');
      if (plan.status === 'Authorised' || plan.status === 'Archived') {
        throw new ConflictException('Authorised or archived capture plans cannot be versioned');
      }
      const [currentVersion] = await tx.select().from(planVersions)
        .where(and(eq(planVersions.planId, planId), eq(planVersions.version, plan.currentVersion)));
      if (!currentVersion) throw new NotFoundException('Current plan version not found');
      const currentSections = await tx.select().from(planSections)
        .where(eq(planSections.versionId, currentVersion.id)).orderBy(planSections.displayOrder);
      const nextVersionNumber = plan.currentVersion + 1;
      const [nextVersion] = await tx.insert(planVersions).values({ planId, version: nextVersionNumber, changeSummary, createdByUserId: user.id }).returning();
      await tx.insert(planSections).values(currentSections.map((section) => ({
        versionId: nextVersion.id,
        code: section.code,
        title: section.title,
        owningAgent: section.owningAgent,
        status: section.status,
        content: section.content,
        citations: section.citations,
        displayOrder: section.displayOrder,
      })));
      await tx.update(capturePlans).set({ currentVersion: nextVersionNumber, updatedAt: new Date() }).where(eq(capturePlans.id, planId));
      await tx.insert(auditEvents).values({
        orgId,
        opportunityId: plan.opportunityId,
        planId,
        actorType: 'Human',
        actorId: user.id,
        action: 'Capture plan version created',
        details: { version: nextVersionNumber, changeSummary },
      });
      return nextVersion;
    });
  }

  async createAgentRun(orgId: string, planId: string, input: Record<string, unknown>, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    const [plan] = await this.db.select().from(capturePlans)
      .where(and(eq(capturePlans.id, planId), eq(capturePlans.orgId, orgId)));
    if (!plan) throw new NotFoundException('Capture plan not found');
    if (plan.status === 'Authorised' || plan.status === 'Archived') {
      throw new ConflictException('Agent runs cannot be queued for authorised or archived plans');
    }
    if (typeof input.agent !== 'string' || !agentNames.includes(input.agent as AgentName)) {
      throw new BadRequestException('Agent is invalid');
    }
    const inputSnapshot = input.inputSnapshot && typeof input.inputSnapshot === 'object' && !Array.isArray(input.inputSnapshot)
      ? input.inputSnapshot as Record<string, unknown>
      : {};
    if (JSON.stringify(inputSnapshot).length > 50_000) throw new BadRequestException('Agent input snapshot is too large');
    const [run] = await this.db.insert(agentRuns).values({
      orgId,
      planId,
      agent: input.agent,
      status: 'Queued',
      inputSnapshot,
      createdByUserId: user.id,
    }).returning();
    await this.db.insert(auditEvents).values({
      orgId,
      opportunityId: plan.opportunityId,
      planId,
      actorType: 'Human',
      actorId: user.id,
      action: 'Agent run queued',
      details: { agentRunId: run.id, agent: run.agent },
    });
    return run;
  }

  async updatePlanStatus(orgId: string, planId: string, statusInput: unknown, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    if (typeof statusInput !== 'string' || !(statusInput in planTransitions)) {
      throw new BadRequestException('Plan status is invalid');
    }
    const status = statusInput as PlanStatus;
    return this.db.transaction(async (tx) => {
      const [plan] = await tx.select().from(capturePlans)
        .where(and(eq(capturePlans.id, planId), eq(capturePlans.orgId, orgId))).for('update');
      if (!plan) throw new NotFoundException('Capture plan not found');
      if (!(planTransitions[plan.status] as readonly PlanStatus[]).includes(status)) {
        throw new ConflictException(`Capture plan cannot transition from ${plan.status} to ${status}`);
      }
      if ((status === 'Authorised' || status === 'Archived') && !this.isAdministrator(orgId, user)) {
        throw new ForbiddenException('Organisation administrator access is required');
      }
      const now = new Date();
      const [updated] = await tx.update(capturePlans).set({
        status,
        updatedAt: now,
        authorisedByUserId: status === 'Authorised' ? user.id : plan.authorisedByUserId,
        authorisedAt: status === 'Authorised' ? now : plan.authorisedAt,
      }).where(eq(capturePlans.id, planId)).returning();
      await tx.insert(auditEvents).values({
        orgId,
        opportunityId: plan.opportunityId,
        planId,
        actorType: 'Human',
        actorId: user.id,
        action: 'Capture plan status changed',
        details: { from: plan.status, to: status },
      });
      return updated;
    });
  }

  async listAudit(orgId: string, user: ProductAuthUser) {
    this.assertOrgAccess(orgId, user);
    return this.db.select().from(auditEvents).where(eq(auditEvents.orgId, orgId)).orderBy(desc(auditEvents.createdAt)).limit(250);
  }
}