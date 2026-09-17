import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

// Placeholder table so the product database has an initial migration.
// Real CreditGuard (Parent Company Guarantee) domain tables land here later.
export const placeholders = pgTable('placeholders', {
  id: uuid('id').primaryKey().defaultRandom(),
  label: varchar('label', { length: 200 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const requests = pgTable(
  'requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    projectId: uuid('project_id'),
    requestNumber: varchar('request_number', { length: 40 }).notNull(),
    instrumentType: varchar('instrument_type', { length: 80 }).notNull(),
    applicant: varchar('applicant', { length: 200 }).notNull(),
    beneficiary: varchar('beneficiary', { length: 200 }).notNull(),
    amount: integer('amount').notNull().default(0),
    currency: varchar('currency', { length: 3 }).notNull().default('USD'),
    status: varchar('status', { length: 40 }).notNull().default('Draft'),
    requestedBy: varchar('requested_by', { length: 200 }).notNull(),
    requestedByUserId: uuid('requested_by_user_id'),
    assignedReviewerUserId: uuid('assigned_reviewer_user_id'),
    assignedReviewerName: varchar('assigned_reviewer_name', { length: 200 }),
    assignedReviewerEmail: varchar('assigned_reviewer_email', { length: 320 }),
    submittedForReviewAt: timestamp('submitted_for_review_at', { withTimezone: true }),
    reviewedByUserId: uuid('reviewed_by_user_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    approversFinalizedByUserId: uuid('approvers_finalized_by_user_id'),
    approversFinalizedAt: timestamp('approvers_finalized_at', { withTimezone: true }),
    signitEnvelopeId: varchar('signit_envelope_id', { length: 500 }),
    approvalInitiatedByUserId: uuid('approval_initiated_by_user_id'),
    approvalInitiatedAt: timestamp('approval_initiated_at', { withTimezone: true }),
    dueDate: date('due_date'),
    nextReviewDate: date('next_review_date'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgRequestNumberIdx: uniqueIndex('requests_org_request_number_idx').on(table.orgId, table.requestNumber),
  }),
);

export const requestDetails = pgTable(
  'request_details',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    emailRequestToCorporateTreasury: boolean('email_request_to_corporate_treasury').notNull().default(false),
    enableMultiEntity: boolean('enable_multi_entity').notNull().default(false),
    parentCompanyOfferingGuarantee: jsonb('parent_company_offering_guarantee').$type<string[]>().notNull(),
    dateSubmitted: date('date_submitted').notNull(),
    requestingEntity: jsonb('requesting_entity').$type<string[]>().notNull(),
    contractingEntity: jsonb('contracting_entity').$type<string[]>().notNull(),
    parentEntityType: varchar('parent_entity_type', { length: 20 }).notNull().default('localEntity'),
    proposalContractReference: varchar('proposal_contract_reference', { length: 300 }).notNull(),
    currentContractStatus: varchar('current_contract_status', { length: 200 }).notNull(),
    beneficiaryAddress: text('beneficiary_address'),
    pcgLanguage: varchar('pcg_language', { length: 50 }).notNull().default('Beneficiary / Client Required Format'),
    maximumLiabilityPercent: numeric('maximum_liability_percent', { precision: 5, scale: 2 }),
    obligationsExtinguishedMode: varchar('obligations_extinguished_mode', { length: 10 }).notNull().default('date'),
    obligationsExtinguishedDate: text('obligations_extinguished_date'),
    backgroundRequirement: text('background_requirement').notNull(),
    projectDescription: text('project_description').notNull(),
    optionalComments: text('optional_comments'),
    deliveryInstructions: text('delivery_instructions'),
    attachments: text('attachments'),
    requesterName: varchar('requester_name', { length: 200 }).notNull(),
    requesterApprovalDate: date('requester_approval_date'),
    blFinanceVpNameTitle: varchar('bl_finance_vp_name_title', { length: 250 }),
    blFinanceVpApprovalDate: date('bl_finance_vp_approval_date'),
    blLegalDepartment: varchar('bl_legal_department', { length: 250 }),
    blLegalApprovalDate: date('bl_legal_approval_date'),
    sustainabilityGovernanceApproval: varchar('sustainability_governance_approval', { length: 250 }),
    sustainabilityGovernanceApprovalDate: date('sustainability_governance_approval_date'),
    cfoApproval: varchar('cfo_approval', { length: 250 }),
    cfoApprovalDate: date('cfo_approval_date'),
    corporateTreasuryApproval: varchar('corporate_treasury_approval', { length: 250 }),
    corporateTreasuryApprovalDate: date('corporate_treasury_approval_date'),
    legalLanguageConfirmed: boolean('legal_language_confirmed').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requestIdx: uniqueIndex('request_details_request_idx').on(table.requestId),
  }),
);

export const requestAttachments = pgTable(
  'request_attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => requests.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id').notNull(),
    originalFileName: varchar('original_file_name', { length: 300 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    storageKey: text('storage_key').notNull().unique(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    uploadedBy: varchar('uploaded_by', { length: 200 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requestIdx: index('request_attachments_request_idx').on(table.requestId),
    orgRequestIdx: index('request_attachments_org_request_idx').on(table.orgId, table.requestId),
    mimeTypeCheck: check(
      'request_attachments_mime_type_check',
      sql`${table.mimeType} in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')`,
    ),
    fileSizeCheck: check('request_attachments_file_size_check', sql`${table.fileSizeBytes} >= 0`),
  }),
);

export const businessEntities = pgTable(
  'business_entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jobCodeEntity: varchar('job_code_entity', { length: 20 }).notNull(),
    segment1: varchar('segment1', { length: 20 }).notNull(),
    legalEntityName: varchar('legal_entity_name', { length: 300 }).notNull(),
    ledgerName: varchar('ledger_name', { length: 100 }),
    inventoryOrgName: varchar('inventory_org_name', { length: 150 }),
    inventoryOrgCode: varchar('inventory_org_code', { length: 150 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    businessEntityKeyIdx: uniqueIndex('business_entities_source_key_idx').on(
      table.jobCodeEntity,
      table.segment1,
      table.legalEntityName,
    ),
  }),
);

export const approvers = pgTable(
  'approvers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    email: varchar('email', { length: 320 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    orgIdx: index('approvers_org_idx').on(table.orgId),
    orgEmailIdx: uniqueIndex('approvers_org_email_idx').on(table.orgId, table.email),
  }),
);

export const requestApprovers = pgTable(
  'request_approvers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
    approverId: uuid('approver_id').references(() => approvers.id, { onDelete: 'restrict' }),
    sequenceOrder: integer('sequence_order').notNull(),
    title: varchar('title', { length: 50 }).notNull(),
    approvalStatus: varchar('approval_status', { length: 20 }).notNull().default('pending'),
    actionedDate: timestamp('actioned_date', { withTimezone: true }),
    approvalLink: text('approval_link'),
    assignedByUserId: uuid('assigned_by_user_id').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requestSequenceIdx: uniqueIndex('request_approvers_request_sequence_idx').on(table.requestId, table.sequenceOrder),
    approverIdx: index('request_approvers_approver_idx').on(table.approverId),
  }),
);
