import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { basename, extname } from 'node:path';
import { BadGatewayException, BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Headers, Inject, NotFoundException, Param, Patch, Post, Put, Query, Req, Res, UnauthorizedException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { and, asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import { PRODUCT_DB } from './db/database.module';
import type { ProductDb } from './db';
import { approvers, businessEntities, requestApprovers, requestAttachments, requestDetails, requests } from './db/schema';
import { DOCUMENT_STORAGE, type DocumentStorage } from './documents/document-storage';
import { generatePcgRequestForm } from './documents/pcg-request-form';
import { ProductAuthGuard, type ProductAuthenticatedRequest } from './auth/product-auth.guard';

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface UploadedDocument {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

interface BusinessEntityInput {
  jobCodeEntity: string;
  segment1: string;
  legalEntityName: string;
  ledgerName?: string | null;
  inventoryOrgName?: string | null;
  inventoryOrgCode?: string | null;
}

interface ApproverInput {
  orgId: string;
  name: string;
  email: string;
}

interface RequestDetailsInput {
  emailRequestToCorporateTreasury: boolean;
  enableMultiEntity: boolean;
  parentCompanyOfferingGuarantee: string[];
  parentEntityType?: 'localEntity' | 'mil';
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

interface InitiateApprovalInput {
  orgId: string;
  productId: string;
  attachmentIds: string[];
}

interface RecallApprovalInput {
  orgId: string;
  productId: string;
}

interface RefreshApprovalInput {
  orgId: string;
  productId: string;
}

interface SignitEnvelopeStatusInput {
  orgId: string;
  envelopeId: string;
  status?: string | null;
  recipients: Array<{
    email: string;
    approvalStatus: 'pending' | 'approved' | 'rejected';
    actionedDate?: string | null;
  }>;
}

interface SubmitForReviewInput {
  orgId: string;
  reviewerUserId: string;
  reviewerName: string;
  reviewerEmail: string;
}

const APPROVER_TITLES = ['Local Team', 'Legal Team', 'VP Legal', 'VP Finance', 'EXCOM', 'Chief Legal Officer', 'Chief Financial Officer', 'Treasury Team', 'Treasurer'] as const;
type ApproverTitle = typeof APPROVER_TITLES[number];

interface AssignApproversInput {
  orgId: string;
  approvers: Array<{ sequenceOrder: number; title: ApproverTitle; approverId: string | null }>;
}

@Controller()
export class AppController {
  constructor(
    @Inject(PRODUCT_DB) private readonly db: ProductDb,
    @Inject(DOCUMENT_STORAGE) private readonly documentStorage: DocumentStorage,
    private readonly config: ConfigService,
  ) {}

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
  @UseGuards(ProductAuthGuard)
  async createRequest(@Body() input: RequestInput, @Req() request: ProductAuthenticatedRequest) {
    this.validateRequest(input);
    if (input.details) this.validateDetails(input.details);
    return this.db.transaction(async (tx) => {
      const [created] = await tx.insert(requests).values({ ...this.values(input), status: 'Draft', requestedByUserId: request.user!.id }).returning();
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
      const [current] = await tx.select({ status: requests.status }).from(requests).where(and(eq(requests.id, id), eq(requests.orgId, input.orgId)));
      if (!current) throw new NotFoundException('Request not found');
      if (['Under Review', 'Reviewed', 'Sent for Approval'].includes(current.status)) throw new ConflictException('Requests in review or approval are read-only');
      if (input.status === 'Under Review') {
        const [attachment] = await tx
          .select({ id: requestAttachments.id })
          .from(requestAttachments)
          .where(and(eq(requestAttachments.requestId, id), eq(requestAttachments.orgId, input.orgId)))
          .limit(1);
        if (!attachment) throw new BadRequestException('At least one attachment is required before sending for approval');
      }
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

  @Post('requests/:id/submit-for-review')
  @UseGuards(ProductAuthGuard)
  async submitForReview(@Param('id') id: string, @Body() input: SubmitForReviewInput, @Req() request: ProductAuthenticatedRequest) {
    if (!input.orgId?.trim() || !input.reviewerUserId?.trim() || !input.reviewerName?.trim() || !input.reviewerEmail?.trim()) {
      throw new BadRequestException('Organisation and reviewer details are required');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.reviewerEmail)) {
      throw new BadRequestException('Reviewer email is invalid');
    }
    this.requireOrganisationMembership(request, input.orgId);
    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({
          requestNumber: requests.requestNumber,
          status: requests.status,
          requestedByUserId: requests.requestedByUserId,
          assignedReviewerUserId: requests.assignedReviewerUserId,
        })
        .from(requests)
        .where(and(eq(requests.id, id), eq(requests.orgId, input.orgId), inArray(requests.status, ['Draft', 'Under Review'])))
        .for('update');
      if (!target) throw new ConflictException('Only a Draft or Under Review request can be assigned for review');
      const membership = request.user!.organisations.find((organisation) => organisation.id === input.orgId)?.membership;
      const isAdministrator = membership === 'Owner' || membership === 'Admin' || request.user!.globalRoles.includes('Global Administrator');
      if (target.requestedByUserId !== request.user!.id && !isAdministrator) {
        throw new ForbiddenException('Only the requestor or an administrator can assign the reviewer');
      }
      if (target.status === 'Under Review' && target.assignedReviewerUserId === input.reviewerUserId) {
        throw new ConflictException('Select a different reviewer before reassigning the request');
      }
      if (target.status === 'Draft') {
        const requestPdfFileName = `${target.requestNumber.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')} latest.pdf`;
        const [requestPdf] = await tx
          .select({ id: requestAttachments.id })
          .from(requestAttachments)
          .where(and(
            eq(requestAttachments.requestId, id),
            eq(requestAttachments.orgId, input.orgId),
            eq(requestAttachments.originalFileName, requestPdfFileName),
          ))
          .limit(1);
        if (!requestPdf) throw new BadRequestException('Attach the generated request PDF before submitting for review');
      }

      const submittedAt = new Date();
      const [updated] = await tx
        .update(requests)
        .set({
          status: 'Under Review',
          assignedReviewerUserId: input.reviewerUserId,
          assignedReviewerName: input.reviewerName.trim(),
          assignedReviewerEmail: input.reviewerEmail.trim().toLowerCase(),
          submittedForReviewAt: submittedAt,
          updatedAt: submittedAt,
        })
        .where(and(eq(requests.id, id), eq(requests.orgId, input.orgId), eq(requests.status, target.status)))
        .returning();
      if (!updated) throw new ConflictException('The request changed before it could be submitted for review');
      return { ...updated, previousReviewerUserId: target.assignedReviewerUserId };
    });
  }

  @Post('requests/:id/review-done')
  @UseGuards(ProductAuthGuard)
  async reviewDone(@Param('id') id: string, @Body() input: { orgId?: string }, @Req() request: ProductAuthenticatedRequest) {
    if (!input.orgId?.trim()) throw new BadRequestException('orgId is required');
    this.requireOrganisationMembership(request, input.orgId);
    const reviewedAt = new Date();
    const [updated] = await this.db
      .update(requests)
      .set({ status: 'Reviewed', reviewedByUserId: request.user!.id, reviewedAt, updatedAt: reviewedAt })
      .where(and(
        eq(requests.id, id),
        eq(requests.orgId, input.orgId),
        eq(requests.status, 'Under Review'),
        eq(requests.assignedReviewerUserId, request.user!.id),
      ))
      .returning();
    if (!updated) throw new ForbiddenException('Only the assigned reviewer can complete an Under Review request');
    return updated;
  }

  @Get('requests/:id/approver-assignments')
  @UseGuards(ProductAuthGuard)
  async listRequestApprovers(@Param('id') id: string, @Query('orgId') orgId: string | undefined, @Req() request: ProductAuthenticatedRequest) {
    this.requireOrganisationMembership(request, orgId);
    await this.requireRequest(id, orgId);
    return this.db
      .select({
        id: requestApprovers.id,
        sequenceOrder: requestApprovers.sequenceOrder,
        title: requestApprovers.title,
        approverId: requestApprovers.approverId,
        approverName: approvers.name,
        approverEmail: approvers.email,
        approvalStatus: requestApprovers.approvalStatus,
        actionedDate: requestApprovers.actionedDate,
        approvalLink: requestApprovers.approvalLink,
      })
      .from(requestApprovers)
      .leftJoin(approvers, eq(approvers.id, requestApprovers.approverId))
      .where(and(
        eq(requestApprovers.requestId, id),
        or(isNull(requestApprovers.approverId), eq(approvers.orgId, orgId!)),
      ))
      .orderBy(asc(requestApprovers.sequenceOrder));
  }

  @Put('requests/:id/approver-assignments')
  @UseGuards(ProductAuthGuard)
  async assignRequestApprovers(@Param('id') id: string, @Body() input: AssignApproversInput, @Req() request: ProductAuthenticatedRequest) {
    if (!input.orgId?.trim() || !Array.isArray(input.approvers)) throw new BadRequestException('orgId and approvers are required');
    this.requireOrganisationMembership(request, input.orgId);
    if (input.approvers.length === 0 || input.approvers.length > 50) throw new BadRequestException('Between 1 and 50 approvers are required');
    const sequence = input.approvers.map(({ sequenceOrder }) => sequenceOrder).sort((left, right) => left - right);
    if (sequence.some((value, index) => value !== index + 1)) throw new BadRequestException('Approver sequence must be contiguous and start at 1');
    if (input.approvers.some(({ title }) => !APPROVER_TITLES.includes(title))) {
      throw new BadRequestException('Approver title is invalid');
    }
    const [target] = await this.db.select().from(requests).where(and(eq(requests.id, id), eq(requests.orgId, input.orgId)));
    if (!target) throw new NotFoundException('Request not found');
    if (target.status !== 'Reviewed') throw new ConflictException('Approvers can be assigned only after review is complete');
    if (target.approversFinalizedAt) throw new ConflictException('The approval chain is finalized and cannot be changed');
    const membership = request.user!.organisations.find((organisation) => organisation.id === input.orgId)?.membership;
    const isAdministrator = membership === 'Owner' || membership === 'Admin' || request.user!.globalRoles.includes('Global Administrator');
    if (target.requestedByUserId !== request.user!.id && !isAdministrator) throw new ForbiddenException('Only the requestor or an administrator can assign approvers');

    const existingAssignments = await this.db
      .select({ approvalStatus: requestApprovers.approvalStatus })
      .from(requestApprovers)
      .where(eq(requestApprovers.requestId, id));
    if (existingAssignments.some(({ approvalStatus }) => approvalStatus !== 'pending')) {
      throw new ConflictException('The approval chain cannot be changed after an approver has actioned it');
    }

    const selected = await this.db.select({ id: approvers.id }).from(approvers).where(eq(approvers.orgId, input.orgId));
    const eligibleIds = new Set(selected.map(({ id: approverId }) => approverId));
    if (input.approvers.some(({ approverId }) => approverId && !eligibleIds.has(approverId))) throw new BadRequestException('Every assigned approver must belong to the request organisation');

    await this.db.transaction(async (tx) => {
      await tx.delete(requestApprovers).where(eq(requestApprovers.requestId, id));
      await tx.insert(requestApprovers).values(input.approvers.map(({ sequenceOrder, title, approverId }) => ({ sequenceOrder, title, approverId, requestId: id, assignedByUserId: request.user!.id })));
    });
    return this.listRequestApprovers(id, input.orgId, request);
  }

  @Post('requests/:id/approver-assignments/finalize')
  @UseGuards(ProductAuthGuard)
  async finalizeRequestApprovers(@Param('id') id: string, @Body() input: { orgId?: string }, @Req() request: ProductAuthenticatedRequest) {
    this.requireOrganisationMembership(request, input.orgId);
    const [target] = await this.db.select().from(requests).where(and(eq(requests.id, id), eq(requests.orgId, input.orgId!)));
    if (!target) throw new NotFoundException('Request not found');
    if (target.status !== 'Reviewed') throw new ConflictException('Approvers can be finalized only while the request is Reviewed');
    if (target.approversFinalizedAt) throw new ConflictException('The approval chain is already finalized');
    const membership = request.user!.organisations.find((organisation) => organisation.id === input.orgId)?.membership;
    const isAdministrator = membership === 'Owner' || membership === 'Admin' || request.user!.globalRoles.includes('Global Administrator');
    if (target.requestedByUserId !== request.user!.id && !isAdministrator) {
      throw new ForbiddenException('Only the requestor or an administrator can finalize approvers');
    }
    const assignments = await this.db
      .select({ approverId: requestApprovers.approverId, approvalStatus: requestApprovers.approvalStatus })
      .from(requestApprovers)
      .where(eq(requestApprovers.requestId, id));
    if (assignments.length === 0) throw new ConflictException('Save at least one approver before finalizing');
    if (assignments.some(({ approverId }) => !approverId)) throw new ConflictException('Assign every approver before finalizing');
    if (assignments.some(({ approvalStatus }) => approvalStatus !== 'pending')) {
      throw new ConflictException('The approval chain has already been actioned');
    }
    const finalizedAt = new Date();
    const [updated] = await this.db
      .update(requests)
      .set({ approversFinalizedAt: finalizedAt, approversFinalizedByUserId: request.user!.id, updatedAt: finalizedAt })
      .where(and(eq(requests.id, id), eq(requests.orgId, input.orgId!), eq(requests.status, 'Reviewed'), isNull(requests.approversFinalizedAt)))
      .returning();
    if (!updated) throw new ConflictException('The approval chain could not be finalized');
    return updated;
  }

  @Post('requests/:id/approver-assignments/modify')
  @UseGuards(ProductAuthGuard)
  async modifyRequestApprovers(@Param('id') id: string, @Body() input: { orgId?: string }, @Req() request: ProductAuthenticatedRequest) {
    this.requireOrganisationMembership(request, input.orgId);
    const membership = request.user!.organisations.find((organisation) => organisation.id === input.orgId)?.membership;
    const isAdministrator = membership === 'Owner' || membership === 'Admin' || request.user!.globalRoles.includes('Global Administrator');
    if (!isAdministrator) throw new ForbiddenException('Only an organisation administrator can modify a finalized approval chain');
    const [target] = await this.db.select().from(requests).where(and(eq(requests.id, id), eq(requests.orgId, input.orgId!)));
    if (!target) throw new NotFoundException('Request not found');
    if (target.status !== 'Reviewed') throw new ConflictException('A finalized approval chain can be modified only while the request is Reviewed');
    if (!target.approversFinalizedAt) throw new ConflictException('The approval chain is not finalized');
    const assignments = await this.db
      .select({ approvalStatus: requestApprovers.approvalStatus })
      .from(requestApprovers)
      .where(eq(requestApprovers.requestId, id));
    if (assignments.some(({ approvalStatus }) => approvalStatus !== 'pending')) {
      throw new ConflictException('The approval chain cannot be modified after an approver has actioned it');
    }
    const modifiedAt = new Date();
    const [updated] = await this.db
      .update(requests)
      .set({ approversFinalizedAt: null, approversFinalizedByUserId: null, updatedAt: modifiedAt })
      .where(and(eq(requests.id, id), eq(requests.orgId, input.orgId!), eq(requests.status, 'Reviewed')))
      .returning();
    return updated;
  }

  @Post('requests/:id/initiate-approval')
  @UseGuards(ProductAuthGuard)
  async initiateApproval(@Param('id') id: string, @Body() input: InitiateApprovalInput, @Req() request: ProductAuthenticatedRequest) {
    if (!input.orgId?.trim() || !input.productId?.trim() || !Array.isArray(input.attachmentIds)) {
      throw new BadRequestException('orgId, productId, and attachmentIds are required');
    }
    this.requireOrganisationMembership(request, input.orgId);
    const uniqueAttachmentIds = [...new Set(input.attachmentIds)];
    if (uniqueAttachmentIds.length === 0 || uniqueAttachmentIds.length > 10 || uniqueAttachmentIds.length !== input.attachmentIds.length) {
      throw new BadRequestException('Select between 1 and 10 unique PDF attachments');
    }

    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(requests)
        .where(and(eq(requests.id, id), eq(requests.orgId, input.orgId)))
        .for('update');
      if (!target) throw new NotFoundException('Request not found');
      if (target.status !== 'Reviewed') throw new ConflictException('Approval can be initiated only while the request is Reviewed');
      if (!target.approversFinalizedAt) throw new ConflictException('Finalize the approval chain before initiating approval');
      if (target.signitEnvelopeId) throw new ConflictException('Approval has already been initiated for this request');
      const membership = request.user!.organisations.find((organisation) => organisation.id === input.orgId)?.membership;
      const isAdministrator = membership === 'Owner' || membership === 'Admin' || request.user!.globalRoles.includes('Global Administrator');
      if (target.requestedByUserId !== request.user!.id && !isAdministrator) {
        throw new ForbiddenException('Only the requestor or an administrator can initiate approval');
      }

      const assignments = await tx
        .select({
          id: requestApprovers.id,
          sequenceOrder: requestApprovers.sequenceOrder,
          approverId: requestApprovers.approverId,
          approverName: approvers.name,
          approverEmail: approvers.email,
          approvalStatus: requestApprovers.approvalStatus,
        })
        .from(requestApprovers)
        .leftJoin(approvers, eq(approvers.id, requestApprovers.approverId))
        .where(eq(requestApprovers.requestId, id))
        .orderBy(asc(requestApprovers.sequenceOrder));
      if (assignments.length === 0 || assignments.some(({ approverId, approverName, approverEmail }) => !approverId || !approverName || !approverEmail)) {
        throw new ConflictException('Every finalized approver must have a representative');
      }
      if (assignments.some(({ approvalStatus }) => approvalStatus !== 'pending')) {
        throw new ConflictException('Approval has already been actioned');
      }

      const attachments = await tx
        .select({
          id: requestAttachments.id,
          originalFileName: requestAttachments.originalFileName,
          mimeType: requestAttachments.mimeType,
          fileSizeBytes: requestAttachments.fileSizeBytes,
          storageKey: requestAttachments.storageKey,
        })
        .from(requestAttachments)
        .where(and(
          eq(requestAttachments.requestId, id),
          eq(requestAttachments.orgId, input.orgId),
          inArray(requestAttachments.id, uniqueAttachmentIds),
        ));
      if (attachments.length !== uniqueAttachmentIds.length || attachments.some(({ mimeType }) => mimeType !== PDF_MIME)) {
        throw new BadRequestException('Every selected attachment must be a PDF belonging to this request');
      }

      const form = new FormData();
      form.append('payload', JSON.stringify({
        type: 'DOCUMENT',
        title: `${target.instrumentType} - ${target.beneficiary}`,
        externalId: target.id,
        recipients: assignments.map(({ approverEmail, approverName, sequenceOrder }) => ({
          email: approverEmail,
          name: approverName,
          role: 'APPROVER',
          signingOrder: sequenceOrder,
        })),
        meta: { signingOrder: 'SEQUENTIAL' },
      }));
      for (const attachment of attachments) {
        const content = await this.readStoredDocument(attachment.storageKey, attachment.fileSizeBytes);
        form.append('files', new Blob([new Uint8Array(content)], { type: PDF_MIME }), attachment.originalFileName);
      }

      const coreApiUrl = (this.config.get<string>('CORE_API_URL') ?? 'http://localhost:4000/api').replace(/\/$/, '');
      const serviceKey = this.config.get<string>('CREDITGUARD_INTERNAL_API_KEY');
      if (!serviceKey) throw new BadGatewayException('CreditGuard service authentication is not configured');
      let response: globalThis.Response;
      try {
        response = await fetch(`${coreApiUrl}/organisations/${input.orgId}/modules/${input.productId}/integrations/signit/envelopes`, {
          method: 'POST',
          headers: { Authorization: request.headers.authorization!, 'X-CreditGuard-Service-Key': serviceKey },
          body: form,
        });
      } catch {
        throw new BadGatewayException('Signit integration service could not be reached');
      }
      if (!response.ok) {
        const errorResult = await response.json().catch(() => null) as { message?: unknown } | null;
        const brokerMessage = typeof errorResult?.message === 'string' && errorResult.message.length <= 500
          ? errorResult.message
          : `Signit approval could not be initiated (${response.status})`;
        throw new BadGatewayException(brokerMessage);
      }
      const result = await response.json().catch(() => null) as { id?: unknown; recipients?: unknown } | null;
      if (!result || typeof result.id !== 'string' || !result.id.trim() || result.id.length > 500) {
        throw new BadGatewayException('Signit did not return a valid envelope ID');
      }
      if (!Array.isArray(result.recipients)) {
        throw new BadGatewayException('Signit did not return recipient signing URLs');
      }
      const signingUrls = new Map<string, string>();
      for (const recipient of result.recipients) {
        if (!recipient || typeof recipient !== 'object') throw new BadGatewayException('Signit returned an invalid recipient signing URL');
        const value = recipient as { email?: unknown; signingUrl?: unknown };
        if (typeof value.email !== 'string' || typeof value.signingUrl !== 'string' || value.signingUrl.length > 2048) {
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
        const email = value.email.trim().toLowerCase();
        if (!email || signingUrls.has(email)) throw new BadGatewayException('Signit returned duplicate or invalid recipients');
        signingUrls.set(email, signingUrl.href);
      }
      const expectedEmails = new Set(assignments.map(({ approverEmail }) => approverEmail!.trim().toLowerCase()));
      if (signingUrls.size !== expectedEmails.size || [...expectedEmails].some((email) => !signingUrls.has(email))) {
        throw new BadGatewayException('Signit did not return signing URLs for every approver');
      }
      for (const assignment of assignments) {
        await tx
          .update(requestApprovers)
          .set({ approvalLink: signingUrls.get(assignment.approverEmail!.trim().toLowerCase())! })
          .where(eq(requestApprovers.id, assignment.id));
      }
      const initiatedAt = new Date();
      const [updated] = await tx
        .update(requests)
        .set({
          status: 'Sent for Approval',
          signitEnvelopeId: result.id.trim(),
          approvalInitiatedByUserId: request.user!.id,
          approvalInitiatedAt: initiatedAt,
          updatedAt: initiatedAt,
        })
        .where(and(eq(requests.id, id), eq(requests.orgId, input.orgId)))
        .returning();
      return updated;
    });
  }

  @Post('requests/:id/refresh-approval')
  @UseGuards(ProductAuthGuard)
  async refreshApproval(@Param('id') id: string, @Body() input: RefreshApprovalInput, @Req() request: ProductAuthenticatedRequest) {
    if (!input.orgId?.trim() || !input.productId?.trim()) {
      throw new BadRequestException('orgId and productId are required');
    }
    this.requireOrganisationMembership(request, input.orgId);

    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(requests)
        .where(and(eq(requests.id, id), eq(requests.orgId, input.orgId)))
        .for('update');
      if (!target) throw new NotFoundException('Request not found');
      if (target.status !== 'Sent for Approval' || !target.signitEnvelopeId) {
        throw new ConflictException('Only a request sent for approval can be refreshed');
      }
      const assignments = await tx
        .select({ id: requestApprovers.id, approverEmail: approvers.email })
        .from(requestApprovers)
        .innerJoin(approvers, eq(approvers.id, requestApprovers.approverId))
        .where(and(eq(requestApprovers.requestId, id), eq(approvers.orgId, input.orgId)));
      if (assignments.length === 0) throw new ConflictException('The request has no assigned approvers');

      const coreApiUrl = (this.config.get<string>('CORE_API_URL') ?? 'http://localhost:4000/api').replace(/\/$/, '');
      const serviceKey = this.config.get<string>('CREDITGUARD_INTERNAL_API_KEY');
      if (!serviceKey) throw new BadGatewayException('CreditGuard service authentication is not configured');
      let response: globalThis.Response;
      try {
        response = await fetch(`${coreApiUrl}/organisations/${input.orgId}/modules/${input.productId}/integrations/signit/envelopes/${encodeURIComponent(target.signitEnvelopeId)}`, {
          headers: {
            Authorization: request.headers.authorization!,
            'X-CreditGuard-Service-Key': serviceKey,
          },
        });
      } catch {
        throw new BadGatewayException('Signit integration service could not be reached');
      }
      if (!response.ok) {
        const errorResult = await response.json().catch(() => null) as { message?: unknown } | null;
        const brokerMessage = typeof errorResult?.message === 'string' && errorResult.message.length <= 500
          ? errorResult.message
          : `Signit approval status could not be refreshed (${response.status})`;
        throw new BadGatewayException(brokerMessage);
      }
      const result = await response.json().catch(() => null) as { title?: unknown; status?: unknown; recipients?: unknown } | null;
      if (!result || !Array.isArray(result.recipients)) throw new BadGatewayException('Signit returned an invalid envelope status');
      const recipientStatuses = new Map<string, { approvalStatus: 'pending' | 'approved' | 'rejected'; actionedDate: Date | null }>();
      for (const recipient of result.recipients) {
        if (!recipient || typeof recipient !== 'object') throw new BadGatewayException('Signit returned an invalid recipient status');
        const value = recipient as { email?: unknown; approvalStatus?: unknown; actionedDate?: unknown };
        if (typeof value.email !== 'string' || !['pending', 'approved', 'rejected'].includes(String(value.approvalStatus))) {
          throw new BadGatewayException('Signit returned an invalid recipient status');
        }
        const email = value.email.trim().toLowerCase();
        if (!email || recipientStatuses.has(email)) throw new BadGatewayException('Signit returned duplicate or invalid recipient statuses');
        let actionedDate: Date | null = null;
        if (value.actionedDate !== null && value.actionedDate !== undefined) {
          if (typeof value.actionedDate !== 'string') throw new BadGatewayException('Signit returned an invalid recipient action date');
          actionedDate = new Date(value.actionedDate);
          if (Number.isNaN(actionedDate.getTime())) throw new BadGatewayException('Signit returned an invalid recipient action date');
        }
        recipientStatuses.set(email, {
          approvalStatus: value.approvalStatus as 'pending' | 'approved' | 'rejected',
          actionedDate,
        });
      }
      const expectedEmails = new Set(assignments.map(({ approverEmail }) => approverEmail.trim().toLowerCase()));
      if (recipientStatuses.size !== expectedEmails.size || [...expectedEmails].some((email) => !recipientStatuses.has(email))) {
        throw new BadGatewayException('Signit did not return status for every approver');
      }
      for (const assignment of assignments) {
        const recipient = recipientStatuses.get(assignment.approverEmail.trim().toLowerCase())!;
        await tx
          .update(requestApprovers)
          .set({ approvalStatus: recipient.approvalStatus, actionedDate: recipient.actionedDate })
          .where(eq(requestApprovers.id, assignment.id));
      }
      return {
        title: typeof result.title === 'string' ? result.title : null,
        status: typeof result.status === 'string' ? result.status : null,
      };
    });
  }

  @Post('internal/signit/envelope-status')
  async applySignitEnvelopeStatus(
    @Body() input: SignitEnvelopeStatusInput,
    @Headers('x-creditguard-service-key') suppliedServiceKey?: string,
  ) {
    this.requireInternalServiceKey(suppliedServiceKey);
    if (!input.orgId?.trim() || !input.envelopeId?.trim() || input.envelopeId.length > 500 || !Array.isArray(input.recipients)) {
      throw new BadRequestException('A valid organisation, envelope, and recipient status list are required');
    }
    const envelopeStatus = typeof input.status === 'string' ? input.status.trim().toUpperCase() : '';
    const recipientStatuses = new Map<string, { approvalStatus: 'pending' | 'approved' | 'rejected'; actionedDate: Date | null }>();
    for (const recipient of input.recipients) {
      if (!recipient || typeof recipient.email !== 'string' || recipient.email.length > 320
        || !['pending', 'approved', 'rejected'].includes(recipient.approvalStatus)) {
        throw new BadRequestException('Signit returned an invalid recipient status');
      }
      const email = recipient.email.trim().toLowerCase();
      if (!email || recipientStatuses.has(email)) throw new BadRequestException('Signit returned duplicate or invalid recipient statuses');
      let actionedDate: Date | null = null;
      if (recipient.actionedDate !== null && recipient.actionedDate !== undefined) {
        actionedDate = new Date(recipient.actionedDate);
        if (Number.isNaN(actionedDate.getTime())) throw new BadRequestException('Signit returned an invalid recipient action date');
      }
      recipientStatuses.set(email, { approvalStatus: recipient.approvalStatus, actionedDate });
    }

    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select({ id: requests.id, status: requests.status })
        .from(requests)
        .where(and(eq(requests.orgId, input.orgId.trim()), eq(requests.signitEnvelopeId, input.envelopeId.trim())))
        .for('update');
      if (!target) throw new NotFoundException('Signit envelope was not found');
      const nextStatus = envelopeStatus === 'COMPLETED' ? 'Approved' : envelopeStatus === 'REJECTED' ? 'Rejected' : null;
      if (!['Sent for Approval', 'Approved', 'Rejected'].includes(target.status)
        || (nextStatus && target.status !== 'Sent for Approval' && target.status !== nextStatus)) {
        throw new ConflictException('The request cannot accept this Signit status update');
      }
      const assignments = await tx
        .select({ id: requestApprovers.id, approverEmail: approvers.email })
        .from(requestApprovers)
        .innerJoin(approvers, eq(approvers.id, requestApprovers.approverId))
        .where(and(eq(requestApprovers.requestId, target.id), eq(approvers.orgId, input.orgId.trim())));
      const expectedEmails = new Set(assignments.map(({ approverEmail }) => approverEmail.trim().toLowerCase()));
      if (expectedEmails.size === 0 || recipientStatuses.size !== expectedEmails.size
        || [...expectedEmails].some((email) => !recipientStatuses.has(email))) {
        throw new BadRequestException('Signit did not return status for every approver');
      }
      for (const assignment of assignments) {
        const recipient = recipientStatuses.get(assignment.approverEmail.trim().toLowerCase())!;
        await tx
          .update(requestApprovers)
          .set({ approvalStatus: recipient.approvalStatus, actionedDate: recipient.actionedDate })
          .where(eq(requestApprovers.id, assignment.id));
      }
      if (nextStatus && target.status !== nextStatus) {
        await tx
          .update(requests)
          .set({ status: nextStatus, updatedAt: new Date() })
          .where(eq(requests.id, target.id));
      }
      return { success: true, requestId: target.id, status: nextStatus ?? target.status };
    });
  }

  @Post('requests/:id/recall-approval')
  @UseGuards(ProductAuthGuard)
  async recallApproval(@Param('id') id: string, @Body() input: RecallApprovalInput, @Req() request: ProductAuthenticatedRequest) {
    if (!input.orgId?.trim() || !input.productId?.trim()) {
      throw new BadRequestException('orgId and productId are required');
    }
    this.requireOrganisationMembership(request, input.orgId);
    const membership = request.user!.organisations.find((organisation) => organisation.id === input.orgId)?.membership;
    const isAdministrator = membership === 'Owner' || membership === 'Admin' || request.user!.globalRoles.includes('Global Administrator');
    if (!isAdministrator) throw new ForbiddenException('Only an organisation administrator can recall approval');

    return this.db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(requests)
        .where(and(eq(requests.id, id), eq(requests.orgId, input.orgId)))
        .for('update');
      if (!target) throw new NotFoundException('Request not found');
      if (target.status !== 'Sent for Approval' || !target.signitEnvelopeId) {
        throw new ConflictException('Only a request sent for approval can be recalled');
      }

      const coreApiUrl = (this.config.get<string>('CORE_API_URL') ?? 'http://localhost:4000/api').replace(/\/$/, '');
      const serviceKey = this.config.get<string>('CREDITGUARD_INTERNAL_API_KEY');
      if (!serviceKey) throw new BadGatewayException('CreditGuard service authentication is not configured');
      let response: globalThis.Response;
      try {
        response = await fetch(`${coreApiUrl}/organisations/${input.orgId}/modules/${input.productId}/integrations/signit/envelopes/delete`, {
          method: 'POST',
          headers: {
            Authorization: request.headers.authorization!,
            'Content-Type': 'application/json',
            'X-CreditGuard-Service-Key': serviceKey,
          },
          body: JSON.stringify({ envelopeId: target.signitEnvelopeId }),
        });
      } catch {
        throw new BadGatewayException('Signit integration service could not be reached');
      }
      if (!response.ok) {
        const errorResult = await response.json().catch(() => null) as { message?: unknown } | null;
        const brokerMessage = typeof errorResult?.message === 'string' && errorResult.message.length <= 500
          ? errorResult.message
          : `Signit approval could not be recalled (${response.status})`;
        throw new BadGatewayException(brokerMessage);
      }
      const result = await response.json().catch(() => null) as { success?: unknown } | null;
      if (result?.success !== true) throw new BadGatewayException('Signit did not confirm the envelope recall');

      const recalledAt = new Date();
      await tx
        .update(requestApprovers)
        .set({ approvalLink: null })
        .where(eq(requestApprovers.requestId, id));
      const [updated] = await tx
        .update(requests)
        .set({ status: 'Reviewed', signitEnvelopeId: null, updatedAt: recalledAt })
        .where(and(eq(requests.id, id), eq(requests.orgId, input.orgId), eq(requests.status, 'Sent for Approval')))
        .returning();
      return updated;
    });
  }

  @Delete('requests/:id')
  async deleteRequest(@Param('id') id: string, @Query('orgId') orgId?: string) {
    if (!orgId) throw new BadRequestException('orgId is required');
    const target = await this.requireRequest(id, orgId);
    if (['Under Review', 'Reviewed', 'Sent for Approval'].includes(target.status)) {
      throw new ConflictException('Requests in review or approval cannot be deleted');
    }
    const attachments = await this.db
      .select({ storageKey: requestAttachments.storageKey })
      .from(requestAttachments)
      .where(and(eq(requestAttachments.requestId, id), eq(requestAttachments.orgId, orgId)));
    await Promise.all(attachments.map(({ storageKey }) => this.documentStorage.delete(storageKey)));
    const [deleted] = await this.db
      .delete(requests)
      .where(and(eq(requests.id, id), eq(requests.orgId, orgId)))
      .returning({ id: requests.id });
    if (!deleted) throw new NotFoundException('Request not found');
    return { ok: true };
  }

  @Get('requests/:id/attachments')
  async listAttachments(@Param('id') id: string, @Query('orgId') orgId?: string) {
    if (!orgId?.trim()) throw new BadRequestException('orgId is required');
    const [request] = await this.db
      .select({ id: requests.id, status: requests.status, requestNumber: requests.requestNumber, updatedAt: requests.updatedAt })
      .from(requests)
      .where(and(eq(requests.id, id), eq(requests.orgId, orgId)));
    if (!request) throw new NotFoundException('Request not found');
    const attachments = await this.db
      .select({
        id: requestAttachments.id,
        originalFileName: requestAttachments.originalFileName,
        mimeType: requestAttachments.mimeType,
        fileSizeBytes: requestAttachments.fileSizeBytes,
        sha256: requestAttachments.sha256,
        uploadedBy: requestAttachments.uploadedBy,
        createdAt: requestAttachments.createdAt,
      })
      .from(requestAttachments)
      .where(and(eq(requestAttachments.requestId, id), eq(requestAttachments.orgId, orgId)))
      .orderBy(desc(requestAttachments.createdAt));
    const hasGeneratedRequest = attachments.some(({ originalFileName }) => originalFileName.endsWith(' latest.pdf'));
    if (request.status !== 'Draft' && !hasGeneratedRequest) {
      return [{
        id: `legacy-${request.id}`,
        originalFileName: `${request.requestNumber} - previously attached`,
        mimeType: 'application/x-creditguard-legacy-marker',
        fileSizeBytes: 0,
        uploadedBy: 'Legacy request already passed the attachment phase',
        createdAt: request.updatedAt,
        isLegacyMarker: true,
      }, ...attachments];
    }
    return attachments;
  }

  @Post('requests/:id/attach-request')
  @UseGuards(ProductAuthGuard)
  async attachRequestPdf(@Param('id') id: string, @Body() input: { orgId?: string }, @Req() request: ProductAuthenticatedRequest) {
    if (!input.orgId?.trim()) throw new BadRequestException('orgId is required');
    this.requireOrganisationMembership(request, input.orgId);
    const [record] = await this.db
      .select({ request: requests, details: requestDetails })
      .from(requests)
      .leftJoin(requestDetails, eq(requestDetails.requestId, requests.id))
      .where(and(eq(requests.id, id), eq(requests.orgId, input.orgId)));
    if (!record) throw new NotFoundException('Request not found');
    if (!['Draft', 'Under Review'].includes(record.request.status)) {
      throw new ConflictException('The request PDF can be attached only before review is complete');
    }
    if (!record.details) throw new ConflictException('Request details are required to generate the request PDF');

    const entityIds = [...new Set([
      ...record.details.parentCompanyOfferingGuarantee,
      ...record.details.requestingEntity,
      ...record.details.contractingEntity,
    ].filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)))];
    const entities = entityIds.length === 0 ? [] : await this.db
      .select({ id: businessEntities.id, name: businessEntities.legalEntityName })
      .from(businessEntities)
      .where(inArray(businessEntities.id, entityIds));
    const entityNames = new Map(entities.map(({ id: entityId, name }) => [entityId, name]));
    if (entityNames.size !== entityIds.length) throw new ConflictException('A selected business entity is no longer available');
    const resolveEntityNames = (values: string[]) => values.map((value) => entityNames.get(value) ?? value);
    const pdfDetails = {
      ...record.details,
      parentCompanyOfferingGuarantee: resolveEntityNames(record.details.parentCompanyOfferingGuarantee),
      requestingEntity: resolveEntityNames(record.details.requestingEntity),
      contractingEntity: resolveEntityNames(record.details.contractingEntity),
    };

    let generatedPdf: Buffer;
    try {
      generatedPdf = await generatePcgRequestForm({ ...record.request, details: pdfDetails });
    } catch {
      throw new BadGatewayException('The request PDF could not be generated');
    }
    const attachmentId = randomUUID();
    const storageKey = `${input.orgId}/${id}/${attachmentId}.pdf`;
    const originalFileName = `${record.request.requestNumber.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')} latest.pdf`;
    const sha256 = createHash('sha256').update(generatedPdf).digest('hex');
    await this.documentStorage.put(storageKey, generatedPdf, PDF_MIME).catch(() => {
      throw new BadGatewayException('The generated request PDF could not be stored');
    });

    let replacedStorageKey: string | null = null;
    try {
      const created = await this.db.transaction(async (tx) => {
        const [target] = await tx
          .select({ status: requests.status })
          .from(requests)
          .where(and(eq(requests.id, id), eq(requests.orgId, input.orgId!)))
          .for('update');
        if (!target || !['Draft', 'Under Review'].includes(target.status)) {
          throw new ConflictException('The request PDF can be attached only before review is complete');
        }
        const [previous] = await tx
          .select({ id: requestAttachments.id, storageKey: requestAttachments.storageKey })
          .from(requestAttachments)
          .where(and(
            eq(requestAttachments.requestId, id),
            eq(requestAttachments.orgId, input.orgId!),
            eq(requestAttachments.originalFileName, originalFileName),
          ));
        if (!previous) {
          const existing = await tx
            .select({ id: requestAttachments.id })
            .from(requestAttachments)
            .where(and(eq(requestAttachments.requestId, id), eq(requestAttachments.orgId, input.orgId!)));
          const maximumDocuments = Math.max(1, Number(this.config.get('DOCUMENT_MAX_FILES_PER_REQUEST') ?? 10));
          if (existing.length >= maximumDocuments) throw new BadRequestException(`A request can have at most ${maximumDocuments} attachments`);
        } else {
          replacedStorageKey = previous.storageKey;
          await tx.delete(requestAttachments).where(eq(requestAttachments.id, previous.id));
        }
        const [attachment] = await tx
          .insert(requestAttachments)
          .values({
            id: attachmentId,
            requestId: id,
            orgId: input.orgId!,
            originalFileName,
            mimeType: PDF_MIME,
            fileSizeBytes: generatedPdf.length,
            storageKey,
            sha256,
            uploadedBy: `Generated by ${request.user!.displayName}`.slice(0, 200),
          })
          .returning({
            id: requestAttachments.id,
            originalFileName: requestAttachments.originalFileName,
            mimeType: requestAttachments.mimeType,
            fileSizeBytes: requestAttachments.fileSizeBytes,
            uploadedBy: requestAttachments.uploadedBy,
            createdAt: requestAttachments.createdAt,
          });
        return attachment;
      });
      if (replacedStorageKey) await this.documentStorage.delete(replacedStorageKey).catch(() => undefined);
      return created;
    } catch (error) {
      await this.documentStorage.delete(storageKey).catch(() => undefined);
      throw error;
    }
  }

  @Post('requests/:id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @Param('id') id: string,
    @Body('orgId') orgId: string | undefined,
    @Body('uploadedBy') uploadedBy: string | undefined,
    @UploadedFile() file?: UploadedDocument,
  ) {
    const target = await this.requireRequest(id, orgId);
    if (['Reviewed', 'Sent for Approval'].includes(target.status)) throw new ConflictException('Attachments are read-only after review is complete');
    if (!uploadedBy?.trim()) throw new BadRequestException('uploadedBy is required');
    if (!file) throw new BadRequestException('A PDF or DOCX file is required');
    this.validateDocument(file);

    const existing = await this.db
      .select({ id: requestAttachments.id })
      .from(requestAttachments)
      .where(and(eq(requestAttachments.requestId, id), eq(requestAttachments.orgId, orgId!)));
    const maximumDocuments = Math.max(1, Number(this.config.get('DOCUMENT_MAX_FILES_PER_REQUEST') ?? 10));
    if (existing.length >= maximumDocuments) {
      throw new BadRequestException(`A request can have at most ${maximumDocuments} attachments`);
    }

    const attachmentId = randomUUID();
    const extension = file.mimetype === PDF_MIME ? '.pdf' : '.docx';
    const storageKey = `${orgId}/${id}/${attachmentId}${extension}`;
    const originalFileName = basename(file.originalname).slice(0, 300);
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.documentStorage.put(storageKey, file.buffer, file.mimetype);
    try {
      const [created] = await this.db
        .insert(requestAttachments)
        .values({
          id: attachmentId,
          requestId: id,
          orgId: orgId!,
          originalFileName,
          mimeType: file.mimetype,
          fileSizeBytes: file.size,
          storageKey,
          sha256,
          uploadedBy: uploadedBy.trim(),
        })
        .returning({
          id: requestAttachments.id,
          originalFileName: requestAttachments.originalFileName,
          mimeType: requestAttachments.mimeType,
          fileSizeBytes: requestAttachments.fileSizeBytes,
          sha256: requestAttachments.sha256,
          uploadedBy: requestAttachments.uploadedBy,
          createdAt: requestAttachments.createdAt,
        });
      return created;
    } catch (error) {
      await this.documentStorage.delete(storageKey);
      throw error;
    }
  }

  @Get('requests/:id/attachments/:attachmentId/content')
  async openAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Query('orgId') orgId: string | undefined,
    @Res() response: Response,
  ) {
    const attachment = await this.requireAttachment(id, attachmentId, orgId);
    const document = await this.documentStorage.open(attachment.storageKey).catch(() => {
      throw new NotFoundException('Attachment content not found');
    });
    const disposition = attachment.mimeType === PDF_MIME ? 'inline' : 'attachment';
    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(attachment.originalFileName)}`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (document.contentLength !== undefined) response.setHeader('Content-Length', document.contentLength);
    document.stream.pipe(response);
  }

  @Delete('requests/:id/attachments/:attachmentId')
  async deleteAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @Query('orgId') orgId?: string,
  ) {
    const target = await this.requireRequest(id, orgId);
    if (['Reviewed', 'Sent for Approval'].includes(target.status)) throw new ConflictException('Attachments are read-only after review is complete');
    const attachment = await this.requireAttachment(id, attachmentId, orgId);
    await this.documentStorage.delete(attachment.storageKey);
    await this.db
      .delete(requestAttachments)
      .where(and(eq(requestAttachments.id, attachmentId), eq(requestAttachments.requestId, id), eq(requestAttachments.orgId, orgId!)));
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

  @Get('approvers')
  listApprovers(@Query('orgId') orgId?: string) {
    if (!orgId?.trim()) throw new BadRequestException('orgId is required');
    return this.db
      .select()
      .from(approvers)
      .where(eq(approvers.orgId, orgId))
      .orderBy(asc(approvers.name), asc(approvers.email));
  }

  @Post('approvers')
  async createApprover(@Body() input: ApproverInput) {
    const values = this.approverValues(input);
    try {
      const [created] = await this.db.insert(approvers).values(values).returning();
      return created;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('An approver with this email already exists for the organisation');
      }
      throw error;
    }
  }

  @Patch('approvers/:id')
  async updateApprover(@Param('id') id: string, @Body() input: ApproverInput) {
    const values = this.approverValues(input);
    try {
      const [updated] = await this.db
        .update(approvers)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(approvers.id, id), eq(approvers.orgId, values.orgId)))
        .returning();
      if (!updated) throw new NotFoundException('Approver not found');
      return updated;
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('An approver with this email already exists for the organisation');
      }
      throw error;
    }
  }

  @Delete('approvers/:id')
  async deleteApprover(@Param('id') id: string, @Query('orgId') orgId?: string) {
    if (!orgId?.trim()) throw new BadRequestException('orgId is required');
    const [deleted] = await this.db
      .delete(approvers)
      .where(and(eq(approvers.id, id), eq(approvers.orgId, orgId)))
      .returning({ id: approvers.id });
    if (!deleted) throw new NotFoundException('Approver not found');
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

  private requireInternalServiceKey(suppliedServiceKey?: string) {
    const configuredServiceKey = this.config.get<string>('CREDITGUARD_INTERNAL_API_KEY');
    const suppliedHash = createHash('sha256').update(suppliedServiceKey ?? '').digest();
    const configuredHash = createHash('sha256').update(configuredServiceKey ?? '').digest();
    if (!configuredServiceKey || !suppliedServiceKey || !timingSafeEqual(suppliedHash, configuredHash)) {
      throw new UnauthorizedException('Invalid service credentials');
    }
  }

  private requireOrganisationMembership(request: ProductAuthenticatedRequest, orgId?: string) {
    if (!orgId?.trim()) throw new BadRequestException('orgId is required');
    if (!request.user!.organisations.some((organisation) => organisation.id === orgId)) {
      throw new ForbiddenException('Active organisation membership is required');
    }
  }

  private async requireRequest(id: string, orgId?: string) {
    if (!orgId?.trim()) throw new BadRequestException('orgId is required');
    const [request] = await this.db
      .select({ id: requests.id, status: requests.status })
      .from(requests)
      .where(and(eq(requests.id, id), eq(requests.orgId, orgId)));
    if (!request) throw new NotFoundException('Request not found');
    return request;
  }

  private async readStoredDocument(storageKey: string, expectedSize: number) {
    const maximumSize = Math.max(1, Number(this.config.get('DOCUMENT_MAX_FILE_SIZE_MB') ?? 10)) * 1024 * 1024;
    if (expectedSize > maximumSize) throw new BadRequestException('Selected PDF exceeds the configured file size limit');
    const document = await this.documentStorage.open(storageKey).catch(() => {
      throw new NotFoundException('Selected PDF content not found');
    });
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of document.stream as AsyncIterable<Buffer | Uint8Array | string>) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > maximumSize) throw new BadRequestException('Selected PDF exceeds the configured file size limit');
      chunks.push(buffer);
    }
    return Buffer.concat(chunks);
  }

  private async requireAttachment(id: string, attachmentId: string, orgId?: string) {
    await this.requireRequest(id, orgId);
    const [attachment] = await this.db
      .select()
      .from(requestAttachments)
      .where(and(eq(requestAttachments.id, attachmentId), eq(requestAttachments.requestId, id), eq(requestAttachments.orgId, orgId!)));
    if (!attachment) throw new NotFoundException('Attachment not found');
    return attachment;
  }

  private validateDocument(file: UploadedDocument) {
    const extension = extname(file.originalname).toLowerCase();
    const isPdf = extension === '.pdf' && file.mimetype === PDF_MIME && file.buffer.subarray(0, 5).toString() === '%PDF-';
    const isDocx = extension === '.docx'
      && file.mimetype === DOCX_MIME
      && file.buffer[0] === 0x50
      && file.buffer[1] === 0x4b
      && file.buffer.includes(Buffer.from('[Content_Types].xml'))
      && file.buffer.includes(Buffer.from('word/'));
    if (!isPdf && !isDocx) {
      throw new BadRequestException('Only valid PDF and DOCX documents are allowed');
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

  private approverValues(input: ApproverInput) {
    const orgId = input?.orgId?.trim();
    const name = input?.name?.trim();
    const email = input?.email?.trim().toLowerCase();
    if (!orgId || !name || !email) throw new BadRequestException('Organisation, name and email are required');
    if (name.length > 200) throw new BadRequestException('Approver name must not exceed 200 characters');
    if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('A valid approver email is required');
    }
    return { orgId, name, email };
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
    if (input.parentEntityType !== undefined && !['localEntity', 'mil'].includes(input.parentEntityType)) {
      throw new BadRequestException('Parent entity type must be localEntity or mil');
    }
  }

  private detailValues(input: RequestDetailsInput) {
    const optionalText = (value?: string | null) => value?.trim() || null;
    return {
      emailRequestToCorporateTreasury: input.emailRequestToCorporateTreasury,
      enableMultiEntity: input.enableMultiEntity,
      parentCompanyOfferingGuarantee: this.entityValues(input.parentCompanyOfferingGuarantee),
      parentEntityType: input.parentEntityType ?? 'localEntity',
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
