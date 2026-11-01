import { BadGatewayException, BadRequestException } from '@nestjs/common';

export const SALESFORCE_API_VERSION = 'v63.0';
export const SALESFORCE_OPPORTUNITY_MAX_RECORDS = 50_000;
const MAX_PAGES = 500;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_TEXT_LENGTH = 131_072;
const MAX_DESCRIBED_FIELDS = 500;
const MAX_QUERY_PATH_LENGTH = 15_000;
const fieldNamePattern = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
// Scalar types returned as single JSON values; compound address/location, base64, and encrypted fields are skipped.
const describedFieldTypes = new Set([
  'id', 'string', 'textarea', 'picklist', 'multipicklist', 'combobox', 'reference', 'boolean', 'currency', 'double', 'percent',
  'int', 'long', 'date', 'datetime', 'time', 'email', 'phone', 'url',
]);

export const salesforceOpportunityFields = [
  'Id', 'AccountId', 'RecordTypeId', 'Description', 'StageName', 'CloseDate', 'Bid_Project_Manager_Name__c',
  'Bid_Submission_Date__c', 'Competitor_s_Bid_Price__c', 'Country__c', 'Estimating_Lead__c', 'Forecast__c',
  'Forecasted_Award_Date__c', 'Forecasted_Gross_Profit__c', 'Forecasted_Revenue__c', 'Get__c', 'Go__c',
  'Opportunity_Number__c', 'Opportunity_Owner_Name__c', 'P_E_Location__c', 'Proposals_Lead__c', 'RFP_Date__c',
  'Region__c', 'SalesCategory__c', 'Sub_Category_Product_Type__c', 'Winning_bidder__c', 'priority__c',
  'Exclude_from_Market_Analyst_Reports1__c', 'Gross_Profit_for_All__c', 'OpportunityName__c',
  'Total_Contract_Value_for_all__c', 'Future_Opportunity_Placeholder__c', 'Project_used_for_Planning__c',
  'Proposal_Submitted__c', 'Business_Line__c', 'Project_Typ__c', 'Bid_Slate__c', 'Binding2__c',
  'PG2_L1_Approved__c', 'PG2_L2_3_Approved__c', 'PG3_L1_Approved__c', 'PG3_L2_3_Approved__c',
  'PG3_Post_Submission_System_Approved__c', 'PG4_Approved__c', 'PG1_L1_Approved__c', 'PG1_L2_3_Approved__c',
  'PG5_Approved__c', 'ITT_Received__c', 'Service_Agreement_Business_Line__c',
] as const;

export type SalesforceOpportunityField = typeof salesforceOpportunityFields[number];
export type SalesforceFieldValue = string | number | boolean | null;
export type SalesforceOpportunityRecord = Record<SalesforceOpportunityField, SalesforceFieldValue>;

// Server-side filters are a superset of the Power Query rules; Capture-Pro applies the exact case-sensitive rules.
export const salesforceOpportunitySoql = `SELECT ${salesforceOpportunityFields.join(', ')} FROM Opportunity`
  + ' WHERE Exclude_from_Market_Analyst_Reports1__c = false AND priority__c != null AND Opportunity_Number__c != null'
  + " AND (RecordTypeId = '0120e000000UPzPAAW' OR Service_Agreement_Business_Line__c = 'Subsea & Floating Facilities')";

export function assertSalesforceHttpsUrl(value: string, label: string, requirePath?: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BadRequestException(`${label} must be a valid Salesforce HTTPS URL`);
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.salesforce.com') || url.username || url.password
    || url.search || url.hash || (url.port && url.port !== '443')
    || (requirePath !== undefined && url.pathname !== requirePath)) {
    throw new BadRequestException(`${label} must be a Salesforce HTTPS URL without credentials, query parameters, or fragments`);
  }
  return url;
}

export const salesforceAccountFields = ['Id', 'Name', 'Type', 'Company_Short_Name__c'] as const;
export type SalesforceAccountRecord = Record<typeof salesforceAccountFields[number], SalesforceFieldValue>;
export const salesforceAccountSoql = `SELECT ${salesforceAccountFields.join(', ')} FROM Account`;

export const salesforceCompetitorFields = [
  'Id', 'Comments__c', 'Competitor_Vessel__c', 'Competitor_Yard__c', 'Competitor__c', 'Won__c', 'Competitor_Name__c',
  'Competitor_s_Bid_Price__c', 'Opportunity__c',
] as const;
export const salesforceCompetitorSoql = `SELECT ${salesforceCompetitorFields.join(', ')} FROM Project_Competitor_Details__c`;

// Id is selected in addition to the Power Query columns because an opportunity can have several bid budget records.
export const salesforceBidBudgetFields = [
  'Id', 'Opportunity__c', 'Actual_Bid_Cost__c', 'Compensation__c', 'Opportunity_Bid_Budget_Recovery_Year__c', 'Budgeted_Hours__c',
  'Forecasted_Spend__c', 'Actual_Bid_Budget__c', 'Additional_Pre_Contract_1__c', 'Additional_Pre_Contract_2__c',
  'Additional_Pre_Contract_3__c', 'Forecast_Purpose__c', 'PG1_Pre_Contract__c',
] as const;
export const salesforceBidBudgetSoql = `SELECT ${salesforceBidBudgetFields.join(', ')} FROM Opportunity_Bid_Budget__c`;

type ExtractDefinition<Field extends string> = { label: string; plural: string; soql: string; fields: readonly Field[] };

function pickRecord<Field extends string>(value: unknown, definition: ExtractDefinition<Field>): Record<Field, SalesforceFieldValue> {
  const { label } = definition;
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadGatewayException(`Salesforce returned an invalid ${label} record`);
  }
  const source = value as Record<string, unknown>;
  const record = {} as Record<Field, SalesforceFieldValue>;
  for (const field of definition.fields) {
    const fieldValue = source[field] ?? null;
    if (fieldValue !== null && !['string', 'number', 'boolean'].includes(typeof fieldValue)) {
      throw new BadGatewayException(`Salesforce returned an unsupported ${label} field value`);
    }
    if (typeof fieldValue === 'number' && !Number.isFinite(fieldValue)) {
      throw new BadGatewayException(`Salesforce returned an invalid numeric ${label} value`);
    }
    if (typeof fieldValue === 'string' && fieldValue.length > MAX_TEXT_LENGTH) {
      throw new BadGatewayException(`Salesforce returned an oversized ${label} value`);
    }
    record[field] = fieldValue as SalesforceFieldValue;
  }
  const id = (record as Record<string, SalesforceFieldValue>).Id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(id)) {
    throw new BadGatewayException(`Salesforce returned an ${label} without a valid Id`);
  }
  return record;
}

async function salesforceFetch(url: string, init: RequestInit, unreachableMessage: string) {
  try {
    return await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    throw new BadGatewayException(unreachableMessage);
  }
}

type Credentials = { tokenUrl: string; clientId: string; clientSecret: string };
type SalesforceSession = { origin: string; accessToken: string };
export type SalesforceFieldDefinition = { name: string; label: string; type: string };

async function salesforceSession(credentials: Credentials): Promise<SalesforceSession> {
  const tokenUrl = assertSalesforceHttpsUrl(credentials.tokenUrl, 'Access Token URL', '/services/oauth2/token');
  const tokenResponse = await salesforceFetch(tokenUrl.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }),
  }, 'Salesforce could not be reached for authentication');
  if (!tokenResponse.ok) throw new BadGatewayException(`Salesforce rejected the token request (${tokenResponse.status})`);
  const token = await tokenResponse.json().catch(() => null) as { access_token?: unknown; instance_url?: unknown } | null;
  if (!token || typeof token.access_token !== 'string' || !token.access_token || token.access_token.length > 8192
    || typeof token.instance_url !== 'string') {
    throw new BadGatewayException('Salesforce returned an invalid token response');
  }
  const accessToken = token.access_token;
  let instance: URL;
  try {
    instance = assertSalesforceHttpsUrl(token.instance_url, 'Salesforce instance URL');
  } catch {
    throw new BadGatewayException('Salesforce returned an untrusted instance URL');
  }
  if (instance.pathname !== '/' && instance.pathname !== '') {
    throw new BadGatewayException('Salesforce returned an untrusted instance URL');
  }
  return { origin: instance.origin, accessToken };
}

async function queryRecords<Field extends string>(session: SalesforceSession, definition: ExtractDefinition<Field>) {
  const { origin, accessToken } = session;
  const nextRecordsPattern = new RegExp(`^/services/data/${SALESFORCE_API_VERSION.replace('.', '\\.')}/query/[A-Za-z0-9-]+$`);
  const records = new Map<string, Record<Field, SalesforceFieldValue>>();
  let path: string | null = `/services/data/${SALESFORCE_API_VERSION}/query?q=${encodeURIComponent(definition.soql)}`;
  if (path.length > MAX_QUERY_PATH_LENGTH) throw new BadGatewayException(`The ${definition.label} query has too many fields`);
  let received = 0;
  for (let page = 0; path; page++) {
    if (page >= MAX_PAGES) throw new BadGatewayException('Salesforce returned too many result pages');
    const response = await salesforceFetch(`${origin}${path}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
    }, `Salesforce could not be reached for the ${definition.label} query`);
    if (!response.ok) throw new BadGatewayException(`Salesforce rejected the ${definition.label} query (${response.status})`);
    const result = await response.json().catch(() => null) as { records?: unknown; done?: unknown; nextRecordsUrl?: unknown } | null;
    if (!result || !Array.isArray(result.records) || typeof result.done !== 'boolean') {
      throw new BadGatewayException(`Salesforce returned an invalid ${definition.label} query response`);
    }
    received += result.records.length;
    if (received > SALESFORCE_OPPORTUNITY_MAX_RECORDS) {
      throw new BadGatewayException(`Salesforce returned more than ${SALESFORCE_OPPORTUNITY_MAX_RECORDS} ${definition.plural}`);
    }
    for (const value of result.records) {
      const record = pickRecord(value, definition);
      records.set((record as Record<string, SalesforceFieldValue>).Id as string, record);
    }
    if (result.done) {
      path = null;
    } else if (typeof result.nextRecordsUrl === 'string' && nextRecordsPattern.test(result.nextRecordsUrl)) {
      path = result.nextRecordsUrl;
    } else {
      throw new BadGatewayException('Salesforce returned an invalid next-page reference');
    }
  }
  return { fetchedAt: new Date().toISOString(), records: [...records.values()] };
}

async function extractSalesforceRecords<Field extends string>(credentials: Credentials, definition: ExtractDefinition<Field>) {
  return queryRecords(await salesforceSession(credentials), definition);
}

async function describeQueryableFields(session: SalesforceSession, sobject: string, label: string): Promise<SalesforceFieldDefinition[]> {
  const response = await salesforceFetch(`${session.origin}/services/data/${SALESFORCE_API_VERSION}/sobjects/${sobject}/describe`, {
    headers: { Authorization: 'Bearer ' + session.accessToken, Accept: 'application/json' },
  }, `Salesforce could not be reached to describe ${label} fields`);
  if (!response.ok) throw new BadGatewayException(`Salesforce rejected the ${label} describe request (${response.status})`);
  const body = await response.json().catch(() => null) as { fields?: unknown } | null;
  if (!body || !Array.isArray(body.fields)) throw new BadGatewayException(`Salesforce returned an invalid ${label} describe response`);
  const fields: SalesforceFieldDefinition[] = [];
  for (const value of body.fields) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadGatewayException(`Salesforce returned an invalid ${label} field definition`);
    const { name, label: fieldLabel, type, deprecatedAndHidden } = value as Record<string, unknown>;
    if (typeof name !== 'string' || !fieldNamePattern.test(name) || typeof type !== 'string') {
      throw new BadGatewayException(`Salesforce returned an invalid ${label} field definition`);
    }
    if (deprecatedAndHidden === true || !describedFieldTypes.has(type)) continue;
    const safeLabel = typeof fieldLabel === 'string' && fieldLabel.trim() && fieldLabel.length <= 255 ? fieldLabel : name;
    fields.push({ name, label: safeLabel, type });
  }
  if (!fields.some((field) => field.name === 'Id')) throw new BadGatewayException(`Salesforce did not describe a ${label} Id field`);
  if (fields.length > MAX_DESCRIBED_FIELDS) throw new BadGatewayException(`Salesforce described more than ${MAX_DESCRIBED_FIELDS} ${label} fields`);
  return fields;
}

export function extractSalesforceOpportunities(credentials: Credentials) {
  return extractSalesforceRecords(credentials, {
    label: 'opportunity', plural: 'opportunities', soql: salesforceOpportunitySoql, fields: salesforceOpportunityFields,
  });
}

export function extractSalesforceAccounts(credentials: Credentials) {
  return extractSalesforceRecords(credentials, {
    label: 'account', plural: 'accounts', soql: salesforceAccountSoql, fields: salesforceAccountFields,
  });
}

export function extractSalesforceCompetitors(credentials: Credentials) {
  return extractSalesforceRecords(credentials, {
    label: 'competitor', plural: 'competitor records', soql: salesforceCompetitorSoql, fields: salesforceCompetitorFields,
  });
}

export function extractSalesforceBidBudgets(credentials: Credentials) {
  return extractSalesforceRecords(credentials, {
    label: 'bid budget', plural: 'bid budget records', soql: salesforceBidBudgetSoql, fields: salesforceBidBudgetFields,
  });
}

export const salesforceFabricationYardObject = 'Fabrication_Yard__c';
export const salesforceVesselObject = 'Vessel__c';

// Mirrors Power Query sources that select every column: fields are described on each sync, then queried.
async function extractSalesforceDescribedObject(credentials: Credentials, sobject: string, label: string, plural: string) {
  const session = await salesforceSession(credentials);
  const fields = await describeQueryableFields(session, sobject, label);
  const names = fields.map((field) => field.name);
  const result = await queryRecords(session, { label, plural, soql: `SELECT ${names.join(', ')} FROM ${sobject}`, fields: names });
  return { ...result, fields };
}

export function extractSalesforceFabricationYards(credentials: Credentials) {
  return extractSalesforceDescribedObject(credentials, salesforceFabricationYardObject, 'fabrication yard', 'fabrication yard records');
}

export function extractSalesforceVessels(credentials: Credentials) {
  return extractSalesforceDescribedObject(credentials, salesforceVesselObject, 'vessel', 'vessel records');
}