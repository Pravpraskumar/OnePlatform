import type { SalesforceOpportunitySummary } from '@platform/shared';

export function opportunityWorkspaceKey(organisationId: string, userId: string): string {
  return `captureProOpportunityWorkspace:v1:${encodeURIComponent(organisationId)}:${encodeURIComponent(userId)}`;
}

export function parseWorkspaceSelection(value: string | null): string[] {
  if (value === null) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.length > 10000
    || !parsed.every((item: unknown) => typeof item === 'string' && /^[a-zA-Z0-9]{15}(?:[a-zA-Z0-9]{3})?$/.test(item))) {
    throw new Error('The saved opportunity workspace is invalid. Clear the selection to start again.');
  }
  return [...new Set<string>(parsed)];
}

function salesforceDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? value : null;
}

export function opportunityLifecycle(row: SalesforceOpportunitySummary, now = new Date()) {
  const ittDate = salesforceDate(row.fields.RFP_Date__c);
  const received = row.fields.ITT_Received__c === true;
  const today = now.toISOString().slice(0, 10);
  const phase = received || (ittDate !== null && ittDate <= today)
    ? 'Post-ITT'
    : ittDate ? 'Pre-ITT' : 'ITT date required';
  const daysToItt = ittDate === null ? null : Math.round((Date.parse(`${ittDate}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86400000);
  return { phase, ittDate, received, daysToItt };
}