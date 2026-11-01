import { boolean, date, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';

export const opportunityStatus = pgEnum('capturepro_opportunity_status', ['Pre-ITT', 'Post-ITT', 'In Review', 'Bid', 'No Bid', 'Closed']);
export const planStatus = pgEnum('capturepro_plan_status', ['Draft', 'In Review', 'Authorised', 'Archived']);
export const sectionStatus = pgEnum('capturepro_section_status', ['Waiting', 'Generated', 'Needs Input', 'Accepted']);
export const runStatus = pgEnum('capturepro_run_status', ['Queued', 'Running', 'Completed', 'Failed']);

export const foundryConversations = pgTable('foundry_conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  binding: varchar('binding', { length: 64 }).notNull(),
  threadId: text('thread_id'),
  title: varchar('title', { length: 100 }).notNull().default('New conversation'),
  blocked: boolean('blocked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ ownerIdx: index('capturepro_foundry_conversation_owner_idx').on(table.orgId, table.ownerId, table.updatedAt) }));

export const foundryMessages = pgTable('foundry_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  ownerId: uuid('owner_id').notNull(),
  conversationId: uuid('conversation_id').notNull().references(() => foundryConversations.id),
  role: varchar('role', { length: 20 }).notNull(),
  text: text('text').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  sources: jsonb('sources').$type<Array<{ label: string }>>().notNull().default([]),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ conversationIdx: index('capturepro_foundry_message_owner_idx').on(table.orgId, table.ownerId, table.conversationId, table.createdAt) }));

export const opportunities = pgTable('opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  projectId: uuid('project_id'),
  opportunityNumber: varchar('opportunity_number', { length: 80 }).notNull(),
  name: varchar('name', { length: 300 }).notNull(),
  client: varchar('client', { length: 240 }).notNull(),
  region: varchar('region', { length: 200 }).notNull(),
  businessLine: varchar('business_line', { length: 160 }),
  scopeType: varchar('scope_type', { length: 100 }),
  status: opportunityStatus('status').notNull().default('Pre-ITT'),
  campaignWindow: varchar('campaign_window', { length: 80 }),
  estimatedValueUsdMillions: integer('estimated_value_usd_millions'),
  waterDepthMetres: integer('water_depth_metres'),
  scopeSummary: text('scope_summary'),
  commercialConstraints: text('commercial_constraints'),
  competitors: jsonb('competitors').$type<string[]>().notNull().default([]),
  createdByUserId: uuid('created_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgNumberUnique: uniqueIndex('capturepro_opportunity_org_number_uq').on(table.orgId, table.opportunityNumber),
  orgStatusIdx: index('capturepro_opportunity_org_status_idx').on(table.orgId, table.status),
}));

export const dataSets = pgTable('data_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  key: varchar('key', { length: 80 }).notNull(),
  name: varchar('name', { length: 240 }).notNull(),
  category: varchar('category', { length: 120 }).notNull(),
  description: text('description').notNull(),
  sourceLocation: text('source_location').notNull(),
  itemCount: integer('item_count').notNull().default(0),
  freshnessPolicy: varchar('freshness_policy', { length: 160 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgKeyUnique: uniqueIndex('capturepro_data_set_org_key_uq').on(table.orgId, table.key),
}));

export const sourceDocuments = pgTable('source_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  dataSetId: uuid('data_set_id').notNull().references(() => dataSets.id, { onDelete: 'cascade' }),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'cascade' }),
  fileName: varchar('file_name', { length: 500 }).notNull(),
  documentType: varchar('document_type', { length: 100 }).notNull(),
  sourceUrl: text('source_url'),
  asOfDate: timestamp('as_of_date', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgOpportunityIdx: index('capturepro_source_document_org_opportunity_idx').on(table.orgId, table.opportunityId),
}));

export const capturePlans = pgTable('capture_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  opportunityId: uuid('opportunity_id').notNull().references(() => opportunities.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 300 }).notNull(),
  status: planStatus('status').notNull().default('Draft'),
  currentVersion: integer('current_version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull(),
  authorisedByUserId: uuid('authorised_by_user_id'),
  authorisedAt: timestamp('authorised_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  opportunityUnique: uniqueIndex('capturepro_plan_opportunity_uq').on(table.opportunityId),
  orgStatusIdx: index('capturepro_plan_org_status_idx').on(table.orgId, table.status),
}));

export const planVersions = pgTable('plan_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  planId: uuid('plan_id').notNull().references(() => capturePlans.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  changeSummary: text('change_summary').notNull(),
  createdByUserId: uuid('created_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  planVersionUnique: uniqueIndex('capturepro_plan_version_uq').on(table.planId, table.version),
}));

export const planSections = pgTable('plan_sections', {
  id: uuid('id').primaryKey().defaultRandom(),
  versionId: uuid('version_id').notNull().references(() => planVersions.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 10 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  owningAgent: varchar('owning_agent', { length: 100 }).notNull(),
  status: sectionStatus('status').notNull().default('Waiting'),
  content: jsonb('content').$type<Record<string, unknown>>().notNull().default({}),
  citations: jsonb('citations').$type<Array<{ label: string; sourceDocumentId?: string }>>().notNull().default([]),
  displayOrder: integer('display_order').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  versionCodeUnique: uniqueIndex('capturepro_section_version_code_uq').on(table.versionId, table.code),
}));

export const agentRuns = pgTable('agent_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  planId: uuid('plan_id').notNull().references(() => capturePlans.id, { onDelete: 'cascade' }),
  agent: varchar('agent', { length: 100 }).notNull(),
  status: runStatus('status').notNull().default('Queued'),
  inputSnapshot: jsonb('input_snapshot').$type<Record<string, unknown>>().notNull().default({}),
  outputSummary: text('output_summary'),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdByUserId: uuid('created_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgPlanIdx: index('capturepro_agent_run_org_plan_idx').on(table.orgId, table.planId),
}));

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  opportunityId: uuid('opportunity_id').references(() => opportunities.id, { onDelete: 'set null' }),
  planId: uuid('plan_id').references(() => capturePlans.id, { onDelete: 'set null' }),
  actorType: varchar('actor_type', { length: 30 }).notNull(),
  actorId: varchar('actor_id', { length: 100 }).notNull(),
  action: varchar('action', { length: 160 }).notNull(),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgCreatedIdx: index('capturepro_audit_org_created_idx').on(table.orgId, table.createdAt),
}));

export const salesforceSyncRuns = pgTable('salesforce_sync_runs', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  objectType: varchar('object_type', { length: 20 }).notNull().default('Opportunity'),
  status: varchar('status', { length: 20 }).notNull(),
  startedByUserId: uuid('started_by_user_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  receivedCount: integer('received_count').notNull().default(0),
  matchedCount: integer('matched_count').notNull().default(0),
  insertedCount: integer('inserted_count').notNull().default(0),
  updatedCount: integer('updated_count').notNull().default(0),
  removedCount: integer('removed_count').notNull().default(0),
  errorMessage: varchar('error_message', { length: 500 }),
}, (table) => ({
  orgStartedIdx: index('capturepro_salesforce_sync_org_started_idx').on(table.orgId, table.startedAt),
  orgTypeStartedIdx: index('capturepro_salesforce_sync_org_type_started_idx').on(table.orgId, table.objectType, table.startedAt),
}));

export type SpinergieSpecificationValue = string | number | boolean | null | SpinergieSpecificationValue[] | { [key: string]: SpinergieSpecificationValue };

export const spinergieSyncRuns = pgTable('spinergie_sync_runs', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  startedByUserId: uuid('started_by_user_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  receivedCount: integer('received_count').notNull().default(0),
  matchedCount: integer('matched_count').notNull().default(0),
  insertedCount: integer('inserted_count').notNull().default(0),
  updatedCount: integer('updated_count').notNull().default(0),
  removedCount: integer('removed_count').notNull().default(0),
  errorMessage: varchar('error_message', { length: 500 }),
}, (table) => ({
  orgStartedIdx: index('capturepro_spinergie_sync_org_started_idx').on(table.orgId, table.startedAt),
}));

export const spinergieVessels = pgTable('spinergie_vessels', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  vesselId: varchar('vessel_id', { length: 30 }).notNull(),
  name: text('name'),
  fields: jsonb('fields').$type<Record<string, SpinergieSpecificationValue>>().notNull(),
  inExtract: boolean('in_extract').notNull().default(true),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  removedFromExtractAt: timestamp('removed_from_extract_at', { withTimezone: true }),
  lastSyncRunId: uuid('last_sync_run_id').notNull().references(() => spinergieSyncRuns.id),
}, (table) => ({
  orgVesselUnique: uniqueIndex('capturepro_spinergie_vessel_org_id_uq').on(table.orgId, table.vesselId),
  orgExtractIdx: index('capturepro_spinergie_vessel_org_extract_idx').on(table.orgId, table.inExtract, table.name),
}));

export const spinergieCharterSyncRuns = pgTable('spinergie_charter_sync_runs', {
  id: uuid('id').primaryKey(),
  orgId: uuid('org_id').notNull(),
  status: varchar('status', { length: 20 }).notNull(),
  startedByUserId: uuid('started_by_user_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  receivedCount: integer('received_count').notNull().default(0),
  matchedCount: integer('matched_count').notNull().default(0),
  insertedCount: integer('inserted_count').notNull().default(0),
  updatedCount: integer('updated_count').notNull().default(0),
  removedCount: integer('removed_count').notNull().default(0),
  errorMessage: varchar('error_message', { length: 500 }),
}, (table) => ({ orgStartedIdx: index('capturepro_spinergie_charter_run_org_started_idx').on(table.orgId, table.startedAt) }));

export const spinergieCharters = pgTable('spinergie_charters', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  charterId: varchar('charter_id', { length: 64 }).notNull(),
  vesselId: varchar('vessel_id', { length: 30 }).notNull(),
  name: text('name'),
  fields: jsonb('fields').$type<Record<string, SpinergieSpecificationValue>>().notNull(),
  inExtract: boolean('in_extract').notNull().default(true),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  removedFromExtractAt: timestamp('removed_from_extract_at', { withTimezone: true }),
  lastSyncRunId: uuid('last_sync_run_id').notNull().references(() => spinergieCharterSyncRuns.id),
}, (table) => ({
  orgCharterUnique: uniqueIndex('capturepro_spinergie_charter_org_id_uq').on(table.orgId, table.charterId),
  orgVesselIdx: index('capturepro_spinergie_charter_org_vessel_idx').on(table.orgId, table.vesselId),
  orgExtractIdx: index('capturepro_spinergie_charter_org_extract_idx').on(table.orgId, table.inExtract, table.name),
}));

export const salesforceAccounts = pgTable('salesforce_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  salesforceId: varchar('salesforce_id', { length: 18 }).notNull(),
  name: text('name'),
  type: text('type'),
  companyShortName: text('company_short_name'),
  inExtract: boolean('in_extract').notNull().default(true),
  firstSyncedAt: timestamp('first_synced_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  removedFromExtractAt: timestamp('removed_from_extract_at', { withTimezone: true }),
  lastSyncRunId: uuid('last_sync_run_id').notNull().references(() => salesforceSyncRuns.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgSalesforceUnique: uniqueIndex('capturepro_salesforce_account_org_sf_uq').on(table.orgId, table.salesforceId),
  orgExtractIdx: index('capturepro_salesforce_account_org_extract_idx').on(table.orgId, table.inExtract, table.name),
}));

export const salesforceOpportunities = pgTable('salesforce_opportunities', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  salesforceId: varchar('salesforce_id', { length: 18 }).notNull(),
  opportunityNumber: text('opportunity_number').notNull(),
  opportunityName: text('opportunity_name'),
  accountId: varchar('account_id', { length: 18 }),
  stageName: text('stage_name'),
  sourceStageName: text('source_stage_name'),
  closeDate: date('close_date', { mode: 'string' }),
  region: text('region'),
  country: text('country'),
  businessLine: text('business_line'),
  salesCategory: text('sales_category'),
  subCategoryProductType: text('sub_category_product_type').notNull(),
  productTypeSubCategory: varchar('product_type_sub_category', { length: 10 }).notNull(),
  priority: text('priority'),
  opportunityOwnerName: text('opportunity_owner_name'),
  forecastedRevenue: numeric('forecasted_revenue'),
  forecastedGrossProfit: numeric('forecasted_gross_profit'),
  totalContractValue: numeric('total_contract_value'),
  fields: jsonb('fields').$type<Record<string, string | number | boolean | null>>().notNull(),
  inExtract: boolean('in_extract').notNull().default(true),
  firstSyncedAt: timestamp('first_synced_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  removedFromExtractAt: timestamp('removed_from_extract_at', { withTimezone: true }),
  lastSyncRunId: uuid('last_sync_run_id').notNull().references(() => salesforceSyncRuns.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgSalesforceUnique: uniqueIndex('capturepro_salesforce_opportunity_org_sf_uq').on(table.orgId, table.salesforceId),
  orgExtractIdx: index('capturepro_salesforce_opportunity_org_extract_idx').on(table.orgId, table.inExtract, table.opportunityNumber),
}));
export const salesforceCompetitors = pgTable('salesforce_competitors', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  salesforceId: varchar('salesforce_id', { length: 18 }).notNull(),
  competitorName: text('competitor_name'),
  competitorAccountId: varchar('competitor_account_id', { length: 18 }),
  opportunitySalesforceId: varchar('opportunity_salesforce_id', { length: 18 }),
  bidPrice: numeric('bid_price'),
  fields: jsonb('fields').$type<Record<string, string | number | boolean | null>>().notNull(),
  inExtract: boolean('in_extract').notNull().default(true),
  firstSyncedAt: timestamp('first_synced_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  removedFromExtractAt: timestamp('removed_from_extract_at', { withTimezone: true }),
  lastSyncRunId: uuid('last_sync_run_id').notNull().references(() => salesforceSyncRuns.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgSalesforceUnique: uniqueIndex('capturepro_salesforce_competitor_org_sf_uq').on(table.orgId, table.salesforceId),
  orgExtractIdx: index('capturepro_salesforce_competitor_org_extract_idx').on(table.orgId, table.inExtract, table.competitorName),
  orgOpportunityIdx: index('capturepro_salesforce_competitor_org_opportunity_idx').on(table.orgId, table.opportunitySalesforceId),
}));

export const salesforceBidBudgets = pgTable('salesforce_bid_budgets', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  salesforceId: varchar('salesforce_id', { length: 18 }).notNull(),
  opportunitySalesforceId: varchar('opportunity_salesforce_id', { length: 18 }),
  fields: jsonb('fields').$type<Record<string, string | number | boolean | null>>().notNull(),
  inExtract: boolean('in_extract').notNull().default(true),
  firstSyncedAt: timestamp('first_synced_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  removedFromExtractAt: timestamp('removed_from_extract_at', { withTimezone: true }),
  lastSyncRunId: uuid('last_sync_run_id').notNull().references(() => salesforceSyncRuns.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgSalesforceUnique: uniqueIndex('capturepro_salesforce_bid_budget_org_sf_uq').on(table.orgId, table.salesforceId),
  orgExtractIdx: index('capturepro_salesforce_bid_budget_org_extract_idx').on(table.orgId, table.inExtract),
  orgOpportunityIdx: index('capturepro_salesforce_bid_budget_org_opportunity_idx').on(table.orgId, table.opportunitySalesforceId),
}));

// Records of Salesforce objects whose fields are discovered on each sync share one column layout.
function describedRecordTable(tableName: string, indexPrefix: string) {
  return pgTable(tableName, {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id').notNull(),
    salesforceId: varchar('salesforce_id', { length: 18 }).notNull(),
    name: text('name'),
    fields: jsonb('fields').$type<Record<string, string | number | boolean | null>>().notNull(),
    inExtract: boolean('in_extract').notNull().default(true),
    firstSyncedAt: timestamp('first_synced_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    removedFromExtractAt: timestamp('removed_from_extract_at', { withTimezone: true }),
    lastSyncRunId: uuid('last_sync_run_id').notNull().references(() => salesforceSyncRuns.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  }, (table) => ({
    orgSalesforceUnique: uniqueIndex(`${indexPrefix}_org_sf_uq`).on(table.orgId, table.salesforceId),
    orgExtractIdx: index(`${indexPrefix}_org_extract_idx`).on(table.orgId, table.inExtract, table.name),
  }));
}

export type SalesforceDescribedRecordTable = ReturnType<typeof describedRecordTable>;
export const salesforceFabricationYards = describedRecordTable('salesforce_fabrication_yards', 'capturepro_salesforce_fabrication_yard');
export const salesforceVessels = describedRecordTable('salesforce_vessels', 'capturepro_salesforce_vessel');

// Field definitions discovered from Salesforce for describe-driven extracts, one row per organisation and object.
export const salesforceObjectFields = pgTable('salesforce_object_fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id').notNull(),
  objectName: varchar('object_name', { length: 80 }).notNull(),
  fields: jsonb('fields').$type<Array<{ name: string; label: string; type: string }>>().notNull(),
  lastSyncRunId: uuid('last_sync_run_id').notNull().references(() => salesforceSyncRuns.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  orgObjectUnique: uniqueIndex('capturepro_salesforce_object_fields_org_object_uq').on(table.orgId, table.objectName),
}));