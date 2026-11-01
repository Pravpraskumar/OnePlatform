import { BadGatewayException } from '@nestjs/common';

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

export type SalesforceFieldValue = string | number | boolean | null;
export type SalesforceOpportunityRecord = Record<typeof salesforceOpportunityFields[number], SalesforceFieldValue>;

export const subseaRecordTypeId = '0120e000000UPzPAAW';
export const subseaServiceAgreementBusinessLine = 'Subsea & Floating Facilities';
const activeBidStages = ['Proposal', 'Evaluation', 'Negotiation'];
const preProposalStages = ['Pre - Qualification', 'Pre-RFP', 'Early Identification'];

export function parseSalesforceRecords(value: unknown): SalesforceOpportunityRecord[] {
  return parseRecords(value, salesforceOpportunityFields, 'Salesforce');
}

export const salesforceAccountFields = ['Id', 'Name', 'Type', 'Company_Short_Name__c'] as const;
export type SalesforceAccountRecord = Record<typeof salesforceAccountFields[number], SalesforceFieldValue>;

export function parseSalesforceAccountRecords(value: unknown): SalesforceAccountRecord[] {
  return parseRecords(value, salesforceAccountFields, 'Salesforce account');
}

export const salesforceCompetitorFields = [
  'Id', 'Comments__c', 'Competitor_Vessel__c', 'Competitor_Yard__c', 'Competitor__c', 'Won__c', 'Competitor_Name__c',
  'Competitor_s_Bid_Price__c', 'Opportunity__c',
] as const;
export type SalesforceCompetitorRecord = Record<typeof salesforceCompetitorFields[number], SalesforceFieldValue>;

export function parseSalesforceCompetitorRecords(value: unknown): SalesforceCompetitorRecord[] {
  return parseRecords(value, salesforceCompetitorFields, 'Salesforce competitor');
}

// Id is selected in addition to the Power Query columns because an opportunity can have several bid budget records.
export const salesforceBidBudgetFields = [
  'Id', 'Opportunity__c', 'Actual_Bid_Cost__c', 'Compensation__c', 'Opportunity_Bid_Budget_Recovery_Year__c', 'Budgeted_Hours__c',
  'Forecasted_Spend__c', 'Actual_Bid_Budget__c', 'Additional_Pre_Contract_1__c', 'Additional_Pre_Contract_2__c',
  'Additional_Pre_Contract_3__c', 'Forecast_Purpose__c', 'PG1_Pre_Contract__c',
] as const;
export type SalesforceBidBudgetRecord = Record<typeof salesforceBidBudgetFields[number], SalesforceFieldValue>;

export function parseSalesforceBidBudgetRecords(value: unknown): SalesforceBidBudgetRecord[] {
  return parseRecords(value, salesforceBidBudgetFields, 'Salesforce bid budget');
}

export type SalesforceFieldDefinition = { name: string; label: string; type: string };
const describedFieldNamePattern = /^[A-Za-z][A-Za-z0-9_]{0,79}$/;
const MAX_DESCRIBED_FIELDS = 500;

// Validates a describe-driven extract: field definitions first, then records limited to those fields.
export function parseSalesforceDescribedExtract(body: { records?: unknown; fields?: unknown }, label: string) {
  if (!Array.isArray(body.fields) || body.fields.length === 0 || body.fields.length > MAX_DESCRIBED_FIELDS) {
    throw new BadGatewayException(`Core returned invalid ${label} field definitions`);
  }
  const names = new Set<string>();
  const fields: SalesforceFieldDefinition[] = body.fields.map((item) => {
    const { name, label: fieldLabel, type } = (item && typeof item === 'object' && !Array.isArray(item) ? item : {}) as Record<string, unknown>;
    if (typeof name !== 'string' || !describedFieldNamePattern.test(name) || names.has(name)
      || typeof fieldLabel !== 'string' || !fieldLabel || fieldLabel.length > 255 || typeof type !== 'string' || !/^[a-z]{1,40}$/.test(type)) {
      throw new BadGatewayException(`Core returned invalid ${label} field definitions`);
    }
    names.add(name);
    return { name, label: fieldLabel, type };
  });
  if (!names.has('Id')) throw new BadGatewayException(`Core returned invalid ${label} field definitions`);
  return { fields, records: parseRecords(body.records, [...names], label) };
}

function parseRecords<Field extends string>(value: unknown, fields: readonly Field[], label: string): Array<Record<Field, SalesforceFieldValue>> {
  if (!Array.isArray(value)) throw new BadGatewayException(`Core returned an invalid ${label} extract`);
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new BadGatewayException(`Core returned an invalid ${label} record`);
    const source = item as Record<string, unknown>;
    const record = {} as Record<Field, SalesforceFieldValue>;
    for (const field of fields) {
      const fieldValue = source[field] ?? null;
      if (fieldValue !== null && !['string', 'number', 'boolean'].includes(typeof fieldValue)) {
        throw new BadGatewayException(`Core returned an unsupported ${label} field value`);
      }
      if (typeof fieldValue === 'number' && !Number.isFinite(fieldValue)) {
        throw new BadGatewayException(`Core returned an invalid ${label} numeric value`);
      }
      record[field] = fieldValue as SalesforceFieldValue;
    }
    const id = (record as Record<string, SalesforceFieldValue>).Id;
    if (typeof id !== 'string' || !/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(id)) {
      throw new BadGatewayException(`Core returned a ${label} record without a valid Id`);
    }
    return record;
  });
}

// Mirrors the Power Query FilteredBusinessLine step; text comparisons are case-sensitive and null-safe like M.
export function matchesCaptureProExtract(record: SalesforceOpportunityRecord) {
  const opportunityNumber = record.Opportunity_Number__c;
  return record.Exclude_from_Market_Analyst_Reports1__c === false
    && typeof opportunityNumber === 'string'
    && !opportunityNumber.startsWith('Q')
    && !opportunityNumber.startsWith('M')
    && record.priority__c !== null
    && (record.RecordTypeId === subseaRecordTypeId || record.Service_Agreement_Business_Line__c === subseaServiceAgreementBusinessLine);
}

// Mirrors the Power Query ReplacedValueStageName step in rule order.
export function deriveStageName(record: SalesforceOpportunityRecord): SalesforceFieldValue {
  const stage = record.StageName;
  const winner = record.Winning_bidder__c;
  if (typeof stage !== 'string') return stage;
  if (activeBidStages.includes(stage) && winner === 'McDermott') return 'Closed Won';
  if (activeBidStages.includes(stage) && winner !== null && winner !== 'McDermott') return 'Closed Lost';
  if ([...preProposalStages, 'Proposal'].includes(stage) && record.Proposal_Submitted__c === true) return 'Evaluation';
  if (preProposalStages.includes(stage) && record.ITT_Received__c === true && record.priority__c !== 'Other' && record.Binding2__c === 'Yes') {
    return 'Proposal';
  }
  return stage;
}

export function transformSalesforceOpportunity(record: SalesforceOpportunityRecord) {
  const subCategory = record.Sub_Category_Product_Type__c === null ? 'TBA' : record.Sub_Category_Product_Type__c;
  const productTypeSubCategory: 'Floater' | 'Subsea' = typeof subCategory === 'string' && subCategory.startsWith('Floating') ? 'Floater' : 'Subsea';
  return {
    sourceStageName: record.StageName,
    fields: {
      ...record,
      StageName: deriveStageName(record),
      Sub_Category_Product_Type__c: subCategory,
      ProductTypeSubCategory: productTypeSubCategory,
    },
  };
}

export type TransformedSalesforceOpportunity = ReturnType<typeof transformSalesforceOpportunity>;
