// Shared API contract types used by the frontend and backends.

export type EntityStatus = 'active' | 'suspended' | 'pending';
export type MenuType = 'Global' | 'Secured';
export type MenuAccessMode = 'readonly' | 'editable';
export type Membership = 'Owner' | 'Admin' | 'Member';

export interface AuthUser {
  id: string;
  b2cOid: string;
  email: string;
  displayName: string;
  globalRoles: string[];
}

export interface OrganisationSummary {
  id: string;
  name: string;
  slug: string;
  status: EntityStatus;
  membership?: Membership;
}

export interface MenuNode {
  id: string;
  parentId: string | null;
  name: string;
  route: string | null;
  icon: string | null;
  type: MenuType;
  productId: string | null;
  displayOrder: number;
  isActive: boolean;
  accessMode?: MenuAccessMode;
  children: MenuNode[];
}

export interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface OrganisationModule {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  licensedSeats: number;
  status: EntityStatus;
  validFrom: string;
  validTo: string | null;
}

export interface SessionUsage {
  licensedSeats: number;
  activeSessions: number;
}

export const GLOBAL_ADMINISTRATOR = 'Global Administrator';
export const ORGANISATION_ADMINISTRATOR = 'Organisation Administrator';
export const GENERAL_USER = 'General User';
export const CAPTURE_PRO_MODULE_ADMINISTRATOR = 'Capture-Pro Module Administrator';

export interface SalesforceIntegrationInput {
  authType: 'OAuth2.0';
  grantType: 'client_credentials';
  accessTokenUrl: string;
  clientId: string;
  clientSecret?: string;
}

export interface SpinergieIntegrationInput {
  apiKey: string;
}

export interface CaptureProIntegrations {
  salesforce: {
    authType: 'OAuth2.0';
    grantType: 'client_credentials';
    accessTokenUrl: string;
    clientId: string;
    clientSecretConfigured: boolean;
    updatedAt: string | null;
  };
  spinergie: {
    apiKeyConfigured: boolean;
    updatedAt: string | null;
  };
}

export interface SalesforceSyncRun {
  id: string;
  status: 'Succeeded' | 'Failed';
  startedAt: string;
  completedAt: string;
  receivedCount: number;
  matchedCount: number;
  insertedCount: number;
  updatedCount: number;
  removedCount: number;
  errorMessage: string | null;
}

export type SpinergieSpecificationValue = string | number | boolean | null | SpinergieSpecificationValue[] | { [key: string]: SpinergieSpecificationValue };

export interface FoundryChatStatus { configured: boolean; ready: boolean; reason: string | null; agentName: string | null }
export interface FoundryConversation { id: string; title: string; blocked: boolean; updatedAt: string }
export interface FoundryMessage { id: string; role: 'user' | 'assistant'; text: string; status: 'Sending' | 'Complete' | 'Failed'; sources: Array<{ label: string }>; error: string | null; createdAt: string }
export interface FoundryConversationDetail { conversation: FoundryConversation; messages: FoundryMessage[] }

export interface SpinergieVesselSummary {
  vesselId: string;
  name: string | null;
  fields: Record<string, SpinergieSpecificationValue>;
  inExtract: boolean;
  lastSeenAt: string;
  removedFromExtractAt: string | null;
}

export interface SpinergieVesselList {
  vessels: SpinergieVesselSummary[];
  lastSync: SalesforceSyncRun | null;
}

export interface SpinergieCharterSummary extends SpinergieVesselSummary {
  charterId: string;
}

export interface SpinergieCharterList {
  charters: SpinergieCharterSummary[];
  lastSync: SalesforceSyncRun | null;
}

export interface SpinergieSyncLog {
  health: SalesforceSyncHealth;
  lastRun: SalesforceSyncRun | null;
  runs: Array<SalesforceSyncRun & { startedByCurrentUser: boolean }>;
}

export interface SalesforceOpportunitySummary {
  id: string;
  salesforceId: string;
  opportunityNumber: string;
  opportunityName: string | null;
  stageName: string | null;
  sourceStageName: string | null;
  closeDate: string | null;
  region: string | null;
  country: string | null;
  businessLine: string | null;
  subCategoryProductType: string;
  productTypeSubCategory: 'Floater' | 'Subsea';
  priority: string | null;
  opportunityOwnerName: string | null;
  forecastedRevenue: string | null;
  forecastedGrossProfit: string | null;
  totalContractValue: string | null;
  fields: Record<string, string | number | boolean | null>;
  inExtract: boolean;
  lastSeenAt: string;
  removedFromExtractAt: string | null;
}

export interface SalesforceOpportunityList {
  lastSync: SalesforceSyncRun | null;
  opportunities: SalesforceOpportunitySummary[];
}

export interface SalesforceSyncHealth {
  status: 'Healthy' | 'Failing' | 'Not synchronized';
  lastRunAt: string | null;
  lastSuccessfulAt: string | null;
  lastFailedAt: string | null;
  consecutiveFailures: number;
  recentRunCount: number;
  recentSuccessCount: number;
}

export interface SalesforceSyncLog {
  health: {
    opportunities: SalesforceSyncHealth;
    accounts: SalesforceSyncHealth;
    competitors: SalesforceSyncHealth;
    bidBudgets: SalesforceSyncHealth;
    fabricationYards: SalesforceSyncHealth;
    vessels: SalesforceSyncHealth;
  };
  lastRuns: {
    opportunities: SalesforceSyncLogEntry | null;
    accounts: SalesforceSyncLogEntry | null;
    competitors: SalesforceSyncLogEntry | null;
    bidBudgets: SalesforceSyncLogEntry | null;
    fabricationYards: SalesforceSyncLogEntry | null;
    vessels: SalesforceSyncLogEntry | null;
  };
  runs: SalesforceSyncLogEntry[];
}

export type SalesforceSyncLogEntry = SalesforceSyncRun & { objectType: SalesforceObjectType; startedByCurrentUser: boolean };

export type SalesforceObjectType = 'Opportunity' | 'Account' | 'Competitor' | 'Bid Budget' | 'Fabrication Yard' | 'Vessel';

export interface SalesforceAccountSummary {
  id: string;
  salesforceId: string;
  name: string | null;
  type: string | null;
  companyShortName: string | null;
  inExtract: boolean;
  lastSeenAt: string;
  removedFromExtractAt: string | null;
}

export interface SalesforceAccountList {
  lastSync: SalesforceSyncRun | null;
  accounts: SalesforceAccountSummary[];
}

export interface SalesforceCompetitorSummary {
  id: string;
  salesforceId: string;
  fields: Record<string, string | number | boolean | null>;
  competitorAccountId: string | null;
  competitorAccountName: string | null;
  opportunitySalesforceId: string | null;
  opportunityNumber: string | null;
  opportunityName: string | null;
  inExtract: boolean;
  lastSeenAt: string;
  removedFromExtractAt: string | null;
}

export interface SalesforceCompetitorList {
  lastSync: SalesforceSyncRun | null;
  competitors: SalesforceCompetitorSummary[];
}

export interface SalesforceBidBudgetSummary {
  id: string;
  salesforceId: string;
  fields: Record<string, string | number | boolean | null>;
  opportunitySalesforceId: string | null;
  opportunityNumber: string | null;
  opportunityName: string | null;
  inExtract: boolean;
  lastSeenAt: string;
  removedFromExtractAt: string | null;
}

export interface SalesforceBidBudgetList {
  lastSync: SalesforceSyncRun | null;
  bidBudgets: SalesforceBidBudgetSummary[];
}

/** A Salesforce field discovered by describing the object during a sync. */
export interface SalesforceFieldDefinition {
  name: string;
  label: string;
  type: string;
}

/** A record of a Salesforce object whose fields are discovered on each sync. */
export interface SalesforceDescribedRecordSummary {
  id: string;
  salesforceId: string;
  name: string | null;
  fields: Record<string, string | number | boolean | null>;
  inExtract: boolean;
  lastSeenAt: string;
  removedFromExtractAt: string | null;
}

export type SalesforceFabricationYardSummary = SalesforceDescribedRecordSummary;
export type SalesforceVesselSummary = SalesforceDescribedRecordSummary;

export interface SalesforceFabricationYardList {
  lastSync: SalesforceSyncRun | null;
  objectName: string;
  fieldDefinitions: SalesforceFieldDefinition[];
  fabricationYards: SalesforceFabricationYardSummary[];
}

export interface SalesforceVesselList {
  lastSync: SalesforceSyncRun | null;
  objectName: string;
  fieldDefinitions: SalesforceFieldDefinition[];
  vessels: SalesforceVesselSummary[];
}