import { BadRequestException, Body, Controller, Delete, Get, Inject, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import { PRODUCT_DB } from './db/database.module';
import type { ProductDb } from './db';
import { businessEntities, requestDetails, requests } from './db/schema';

interface BusinessEntityInput {
  jobCodeEntity: string;
  segment1: string;
  legalEntityName: string;
  ledgerName?: string | null;
  inventoryOrgName?: string | null;
  inventoryOrgCode?: string | null;
}

interface RequestDetailsInput {
  emailRequestToCorporateTreasury: boolean;
  enableMultiEntity: boolean;
  parentCompanyOfferingGuarantee: string[];
  dateSubmitted: string;
  requestingEntity: string[];
  contractingEntity: string[];
  proposalContractReference: string;
  currentContractStatus: string;
  beneficiaryAddress: string;
  pcgLanguage: string;
  maximumLiabilityPercent?: string | null;
  obligationsExtinguishedMode: 'date' | 'text';
  obligationsExtinguishedDate?: string | null;
  backgroundRequirement: string;
  projectDescription: string;
  optionalComments?: string | null;
  deliveryInstructions?: string | null;
  attachments?: string | null;
  requesterName: string;
  requesterApprovalDate?: string | null;
  blFinanceVpNameTitle?: string | null;
  blFinanceVpApprovalDate?: string | null;
  blLegalDepartment?: string | null;
  blLegalApprovalDate?: string | null;
  sustainabilityGovernanceApproval?: string | null;
  sustainabilityGovernanceApprovalDate?: string | null;
  cfoApproval?: string | null;
  cfoApprovalDate?: string | null;
  corporateTreasuryApproval?: string | null;
  corporateTreasuryApprovalDate?: string | null;
  legalLanguageConfirmed: boolean;
}

interface RequestInput {
  orgId: string;
  projectId?: string | null;
  requestNumber: string;
  instrumentType: string;
  applicant: string;
  beneficiary: string;
  amount: number;
  currency: string;
  status: string;
  requestedBy: string;
  dueDate?: string | null;
  nextReviewDate?: string | null;
  notes?: string | null;
  details?: RequestDetailsInput;
}

@Controller()
export class AppController {
  constructor(@Inject(PRODUCT_DB) private readonly db: ProductDb) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'creditguard-service', time: new Date().toISOString() };
  }

  // Placeholder landing payload; real product surface arrives later.
  @Get('landing')
  landing() {
    return {
      product: 'CreditGuard',
      title: 'Parent Company Guarantee',
      description: 'CreditGuard module landing. Feature set to be defined.',
    };
  }

  @Get('requests')
  listRequests(@Query('orgId') orgId?: string, @Query('projectId') projectId?: string) {
    if (!orgId) throw new BadRequestException('orgId is required');
    return this.db
      .select()
      .from(requests)
      .where(projectId ? and(eq(requests.orgId, orgId), eq(requests.projectId, projectId)) : eq(requests.orgId, orgId))
      .orderBy(desc(requests.updatedAt));
  }

  @Post('requests')
  async createRequest(@Body() input: RequestInput) {
    this.validateRequest(input);
    if (input.details) this.validateDetails(input.details);
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(requests).values({ ...this.values(input), status: 'Draft' }).returning();
      if (!input.details) return created;
      const [details] = await tx
        .insert(requestDetails)
        .values({ requestId: created.id, ...this.detailValues(input.details) })
        .returning();
      return { ...created, details };
    });
  }

  @Get('requests/:id')
  async getRequest(@Param('id') id: string, @Query('orgId') orgId?: string) {
    if (!orgId) throw new BadRequestException('orgId is required');
    const [request] = await this.db
      .select()
      .from(requests)
      .where(and(eq(requests.id, id), eq(requests.orgId, orgId)));
    if (!request) throw new NotFoundException('Request not found');
    const [details] = await this.db.select().from(requestDetails).where(eq(requestDetails.requestId, id));
    return { ...request, details: details ?? null };
  }

  @Patch('requests/:id')
  async updateRequest(@Param('id') id: string, @Body() input: RequestInput) {
    this.validateRequest(input);
    if (input.details) this.validateDetails(input.details);
    return this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(requests)
        .set({ ...this.values(input), updatedAt: new Date() })
        .where(and(eq(requests.id, id), eq(requests.orgId, input.orgId)))
        .returning();
      if (!updated) throw new NotFoundException('Request not found');
      if (!input.details) return updated;
      const [details] = await tx
        .insert(requestDetails)
        .values({ requestId: id, ...this.detailValues(input.details) })
        .onConflictDoUpdate({
          target: requestDetails.requestId,
          set: { ...this.detailValues(input.details), updatedAt: new Date() },
        })
        .returning();
      return { ...updated, details };
    });
  }

  @Delete('requests/:id')
  async deleteRequest(@Param('id') id: string, @Query('orgId') orgId?: string) {
    if (!orgId) throw new BadRequestException('orgId is required');
    const [deleted] = await this.db
      .delete(requests)
      .where(and(eq(requests.id, id), eq(requests.orgId, orgId)))
      .returning({ id: requests.id });
    if (!deleted) throw new NotFoundException('Request not found');
    return { ok: true };
  }

  @Get('business-entities')
  listBusinessEntities() {
    return this.db
      .select()
      .from(businessEntities)
      .orderBy(asc(businessEntities.jobCodeEntity), asc(businessEntities.legalEntityName));
  }

  @Post('business-entities')
  async createBusinessEntity(@Body() input: BusinessEntityInput) {
    this.validateBusinessEntity(input);
    const [created] = await this.db.insert(businessEntities).values(this.businessEntityValues(input)).returning();
    return created;
  }

  @Patch('business-entities/:id')
  async updateBusinessEntity(@Param('id') id: string, @Body() input: BusinessEntityInput) {
    this.validateBusinessEntity(input);
    const [updated] = await this.db
      .update(businessEntities)
      .set({ ...this.businessEntityValues(input), updatedAt: new Date() })
      .where(eq(businessEntities.id, id))
      .returning();
    if (!updated) throw new NotFoundException('Business entity not found');
    return updated;
  }

  @Delete('business-entities/:id')
  async deleteBusinessEntity(@Param('id') id: string) {
    const [deleted] = await this.db
      .delete(businessEntities)
      .where(eq(businessEntities.id, id))
      .returning({ id: businessEntities.id });
    if (!deleted) throw new NotFoundException('Business entity not found');
    return { ok: true };
  }

  private validateRequest(input: RequestInput) {
    const required = ['orgId', 'requestNumber', 'instrumentType', 'applicant', 'beneficiary', 'currency', 'status', 'requestedBy'] as const;
    if (required.some((field) => !String(input[field] ?? '').trim())) {
      throw new BadRequestException('All required request fields must be completed');
    }
    if (!Number.isFinite(input.amount) || input.amount < 0) {
      throw new BadRequestException('Amount must be zero or greater');
    }
  }

  private values(input: RequestInput) {
    return {
      orgId: input.orgId,
      projectId: input.projectId || null,
      requestNumber: input.requestNumber.trim(),
      instrumentType: input.instrumentType.trim(),
      applicant: input.applicant.trim(),
      beneficiary: input.beneficiary.trim(),
      amount: input.amount,
      currency: input.currency.trim().toUpperCase(),
      status: input.status.trim(),
      requestedBy: input.requestedBy.trim(),
      dueDate: input.dueDate || null,
      nextReviewDate: input.nextReviewDate || null,
      notes: input.notes?.trim() || null,
    };
  }

  private validateBusinessEntity(input: BusinessEntityInput) {
    if (!input || ![input.jobCodeEntity, input.segment1, input.legalEntityName].every((value) => String(value ?? '').trim())) {
      throw new BadRequestException('Job code entity, segment and legal entity name are required');
    }
  }

  private businessEntityValues(input: BusinessEntityInput) {
    const optionalText = (value?: string | null) => value?.trim() || null;
    return {
      jobCodeEntity: input.jobCodeEntity.trim(),
      segment1: input.segment1.trim(),
      legalEntityName: input.legalEntityName.trim(),
      ledgerName: optionalText(input.ledgerName),
      inventoryOrgName: optionalText(input.inventoryOrgName),
      inventoryOrgCode: optionalText(input.inventoryOrgCode),
    };
  }

  private validateDetails(input: RequestDetailsInput) {
    const required = [
      'dateSubmitted',
      'proposalContractReference',
      'currentContractStatus',
      'beneficiaryAddress',
      'pcgLanguage',
      'backgroundRequirement',
      'projectDescription',
      'requesterName',
    ] as const;
    if (required.some((field) => !String(input[field] ?? '').trim())) {
      throw new BadRequestException('All required request detail fields must be completed');
    }
    const entityFields = [input.parentCompanyOfferingGuarantee, input.requestingEntity, input.contractingEntity];
    if (entityFields.some((values) => !Array.isArray(values) || values.length === 0 || values.some((value) => !String(value).trim()))) {
      throw new BadRequestException('All required entity fields must have a selection');
    }
    if (!input.enableMultiEntity && entityFields.some((values) => values.length > 1)) {
      throw new BadRequestException('Enable multientity to select more than one entity per field');
    }
    if (!['date', 'text'].includes(input.obligationsExtinguishedMode)) {
      throw new BadRequestException('Obligations extinguished mode must be date or text');
    }
  }

  private detailValues(input: RequestDetailsInput) {
    const optionalText = (value?: string | null) => value?.trim() || null;
    return {
      emailRequestToCorporateTreasury: input.emailRequestToCorporateTreasury,
      enableMultiEntity: input.enableMultiEntity,
      parentCompanyOfferingGuarantee: this.entityValues(input.parentCompanyOfferingGuarantee),
      dateSubmitted: input.dateSubmitted,
      requestingEntity: this.entityValues(input.requestingEntity),
      contractingEntity: this.entityValues(input.contractingEntity),
      proposalContractReference: input.proposalContractReference.trim(),
      currentContractStatus: input.currentContractStatus.trim(),
      beneficiaryAddress: input.beneficiaryAddress.trim(),
      pcgLanguage: input.pcgLanguage.trim(),
      maximumLiabilityPercent: optionalText(input.maximumLiabilityPercent),
      obligationsExtinguishedMode: input.obligationsExtinguishedMode,
      obligationsExtinguishedDate: optionalText(input.obligationsExtinguishedDate),
      backgroundRequirement: input.backgroundRequirement.trim(),
      projectDescription: input.projectDescription.trim(),
      optionalComments: optionalText(input.optionalComments),
      deliveryInstructions: optionalText(input.deliveryInstructions),
      attachments: optionalText(input.attachments),
      requesterName: input.requesterName.trim(),
      requesterApprovalDate: input.requesterApprovalDate || null,
      blFinanceVpNameTitle: optionalText(input.blFinanceVpNameTitle),
      blFinanceVpApprovalDate: input.blFinanceVpApprovalDate || null,
      blLegalDepartment: optionalText(input.blLegalDepartment),
      blLegalApprovalDate: input.blLegalApprovalDate || null,
      sustainabilityGovernanceApproval: optionalText(input.sustainabilityGovernanceApproval),
      sustainabilityGovernanceApprovalDate: input.sustainabilityGovernanceApprovalDate || null,
      cfoApproval: optionalText(input.cfoApproval),
      cfoApprovalDate: input.cfoApprovalDate || null,
      corporateTreasuryApproval: optionalText(input.corporateTreasuryApproval),
      corporateTreasuryApprovalDate: input.corporateTreasuryApprovalDate || null,
      legalLanguageConfirmed: input.legalLanguageConfirmed,
    };
  }

  private entityValues(values: string[]) {
    return [...new Set(values.map((value) => value.trim()))];
  }
}
