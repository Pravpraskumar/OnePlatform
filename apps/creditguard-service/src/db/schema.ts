import { boolean, date, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

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
