import { useState, type ReactNode } from 'react';
import type { SalesforceOpportunitySummary } from '@platform/shared';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { formatValue } from './salesforceTable';
import { opportunityLifecycle } from './opportunityWorkspace';

const lifecycleSteps = [
  ['pre', 'Pre-ITT Intake'], ['itt', 'ITT Received'], ['post', 'Post-ITT Intake'], ['stake', 'Stakeholder Map'],
  ['tt', 'Top Tension'], ['ves', 'Vessel Capability & Availability'], ['ca', 'Competitor Analysis'],
] as const;
const sectionTabs = [
  ['pre', 'Pre-ITT Intake'], ['post', 'ITT & Post-ITT Intake'], ['stake', 'Stakeholder Map'],
  ['tt', 'Top Tension & Vessels'], ['ca', 'Competitor Analysis'], ['hist', 'History & Agent Chats'],
] as const;
type SectionTab = typeof sectionTabs[number][0];

const chipStyles = {
  pre: 'bg-amber-100 text-amber-800', post: 'bg-indigo-100 text-indigo-800', info: 'bg-sky-100 text-sky-800',
  bad: 'bg-red-100 text-red-700', warn: 'bg-amber-50 text-amber-800', out: 'border border-slate-300 text-slate-600',
} as const;

export function Chip({ tone, children, title }: { tone: keyof typeof chipStyles; children: ReactNode; title?: string }) {
  return <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold ${chipStyles[tone]}`}>{children}</span>;
}

export function opportunityFlags(row: SalesforceOpportunitySummary, now = new Date()) {
  const { phase, daysToItt } = opportunityLifecycle(row, now);
  const flags: Array<[string, 'bad' | 'info' | 'warn']> = [];
  if (phase !== 'Post-ITT' && daysToItt !== null && daysToItt <= 60) flags.push([`ITT in ${daysToItt} d`, 'info']);
  if (phase === 'Post-ITT' && row.fields.ITT_Received__c !== true) flags.push(['Expected ITT date passed · confirm receipt', 'bad']);
  if (!row.inExtract) flags.push(['Not in latest extract', 'warn']);
  return flags;
}

function formatDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
}

function dateField(row: SalesforceOpportunitySummary, key: string) {
  const value = row.fields[key];
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value) : formatValue(value ?? null);
}
const intakeFields = [
  ['AccountId', 'Client account'], ['Region__c', 'Region'], ['Business_Line__c', 'Business line'], ['Sub_Category_Product_Type__c', 'Product / scope'],
  ['Total_Contract_Value_for_all__c', 'Contract value'], ['Forecasted_Revenue__c', 'Forecast revenue'], ['StageName', 'Salesforce stage'], ['Opportunity_Owner_Name__c', 'Opportunity owner'],
  ['RFP_Date__c', 'ITT / RFP date'], ['Bid_Submission_Date__c', 'Bid submission'], ['Forecasted_Award_Date__c', 'Forecast award'], ['CloseDate', 'Close date'],
  ['Bid_Project_Manager_Name__c', 'Bid project manager'], ['Proposals_Lead__c', 'Proposals lead'], ['Estimating_Lead__c', 'Estimating lead'], ['priority__c', 'Priority'],
  ['Forecasted_Gross_Profit__c', 'Forecast gross profit'], ['Go__c', 'Go'], ['Get__c', 'Get'], ['SalesCategory__c', 'Sales category'],
] as const;

function ReadOnlyField({ label, source, children, wide = false }: { label: string; source: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${wide ? 'col-span-full' : ''}`}>
      <dt className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em] text-slate-600">
        {label}<span title={`Read-only · ${source}`} className="rounded border border-slate-300 bg-slate-50 px-1 text-[9px] font-extrabold text-slate-500">RO</span>
      </dt>
      <dd className="min-h-8 break-words rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-sm text-slate-900">{children}</dd>
    </div>
  );
}

export function OpportunityPreIttPanel({ row, accountName, onDetails }: { row: SalesforceOpportunitySummary; accountName: string | null; onDetails: () => void }) {
  const [tab, setTab] = useState<SectionTab>('pre');
  const lifecycle = opportunityLifecycle(row);
  const client = accountName ?? formatValue(row.fields.AccountId ?? null);
  const post = lifecycle.phase === 'Post-ITT';
  const stageChip = <Chip tone={post ? 'post' : 'pre'} title="Suggested from ITT date / receipt · appended with Salesforce StageName">
    <span data-testid="opportunity-lifecycle-phase">{lifecycle.phase}</span> · {formatValue(row.sourceStageName)}
  </Chip>;
  const statusChip = <Chip tone="out" title="No workspace progress is recorded yet">Not started</Chip>;
  const days = lifecycle.daysToItt;
  const ittSource = lifecycle.received ? 'Salesforce ITT_Received__c' : lifecycle.ittDate ? 'Salesforce RFP_Date__c' : 'Not supplied';
  const tcv = row.fields.Total_Contract_Value_for_all__c;
  return (
    <article aria-label={`Workspace opportunity ${row.opportunityNumber}`} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="min-w-0 break-words text-[17px] font-semibold text-slate-950"><span className="font-mono">{row.opportunityNumber}</span> · {row.opportunityName ?? 'Salesforce opportunity'}</h2>
          {stageChip}{statusChip}
          {opportunityFlags(row).map(([label, tone]) => <Chip key={label} tone={tone}>{label}</Chip>)}
          <span className="ml-auto flex items-center gap-2">
            {tcv !== null && tcv !== undefined && <span className="text-xs text-slate-500" title="Total_Contract_Value_for_all__c">{formatValue(tcv)}</span>}
            <Button variant="ghost" className="px-2 py-1 text-xs" onClick={onDetails}><ExternalLink size={14} />All Salesforce fields</Button>
          </span>
        </div>
        <p className="mb-3 mt-1 text-xs text-slate-600">{client} · {formatValue(row.country)} · {formatValue(row.fields.Sub_Category_Product_Type__c ?? null)} · award {dateField(row, 'Forecasted_Award_Date__c')}</p>
      </header>
      <dl aria-label="ITT summary" className="my-2 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3 xl:grid-cols-6">
        {([
          ['ITT date', <><b className="text-[13.5px]">{formatDate(lifecycle.ittDate)}</b> <span className="text-xs text-slate-500">{lifecycle.received ? 'received' : 'expected'}</span></>],
          ['ITT source', <span className="text-xs">{ittSource}</span>],
          ['Opportunity stage', stageChip],
          [days !== null && days < 0 ? 'Days since ITT' : 'Days to ITT', <b className="text-[13.5px]">{days === null ? '—' : Math.abs(days)}</b>],
          ['Bid submission', <b className="text-[13.5px]">{dateField(row, 'Bid_Submission_Date__c')}</b>],
          ['Current status', statusChip],
        ] as Array<[string, ReactNode]>).map(([label, value]) => (
          <div key={label} className="bg-slate-50 px-3 py-2">
            <dt className="mb-1 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-600">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <ol aria-label="Opportunity lifecycle" className="mb-3 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4 xl:grid-cols-7">
        {lifecycleSteps.map(([key, label], index) => {
          const current = key === 'pre';
          const awaitsItt = !post && (key === 'itt' || key === 'post');
          return (
            <li key={key} aria-current={current ? 'step' : undefined} className={`px-2.5 py-2 text-[11px] text-slate-600 ${current ? 'bg-indigo-50' : 'bg-white'} ${awaitsItt ? 'opacity-50' : ''}`}>
              <span aria-hidden="true" className="inline-grid h-[19px] w-[19px] place-items-center rounded-full border-[1.5px] border-slate-300 text-[10px] font-bold">{index + 1}</span>
              <b className="my-1 block text-[11.5px] text-slate-900">{label}</b>
              <span>{awaitsItt ? 'awaits ITT' : 'pending'}</span>
            </li>
          );
        })}
      </ol>
      <div role="tablist" aria-label="Opportunity sections" className="flex flex-wrap gap-0.5 border-b-2 border-slate-200">
        {sectionTabs.map(([key, label]) => (
          <button key={key} id={`opportunity-section-${key}`} type="button" role="tab" aria-selected={tab === key} aria-controls="opportunity-section-panel" onClick={() => setTab(key)}
            className={`-mb-0.5 border-b-2 px-3 py-2 text-[12.5px] font-semibold ${tab === key ? 'border-indigo-700 text-indigo-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{label}</button>
        ))}
      </div>
      <div id="opportunity-section-panel" role="tabpanel" aria-labelledby={`opportunity-section-${tab}`} className="pt-3.5">
      {tab !== 'pre' ? <p className="rounded-lg border border-slate-200 bg-indigo-50 px-3.5 py-2.5 text-xs text-slate-700">This section is not implemented yet.</p> : <section aria-labelledby="pre-itt-heading">
        <h3 id="pre-itt-heading" className="sr-only">Pre-ITT Intake</h3>
        <p className="rounded-lg border border-slate-200 bg-indigo-50 px-3.5 py-2.5 text-xs text-slate-700">Values come from the synced Salesforce extract (read-only, marked RO). Contract type and bid budget are not part of the current opportunity extract.</p>
        <dl className="mt-3 grid grid-cols-1 gap-x-3.5 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
          {intakeFields.map(([key, label]) => (
            <ReadOnlyField key={key} label={label} source={key === 'AccountId' ? 'Account.Name via Opportunity.AccountId' : key}>
              {key === 'AccountId'
                ? client
                : key === 'Region__c'
                ? <>{formatValue(row.fields.Region__c ?? null)} <span className="text-xs text-slate-500">· {formatValue(row.fields.Country__c ?? null)}</span></>
                : key.endsWith('Date__c') || key === 'CloseDate' ? dateField(row, key) : formatValue(row.fields[key] ?? null)}
            </ReadOnlyField>
          ))}
          <ReadOnlyField label="Indicative scope" source="Description" wide>
            <span className="block max-h-48 overflow-y-auto whitespace-pre-wrap leading-6">{formatValue(row.fields.Description ?? null)}</span>
          </ReadOnlyField>
        </dl>
      </section>}
      </div>
    </article>
  );
}