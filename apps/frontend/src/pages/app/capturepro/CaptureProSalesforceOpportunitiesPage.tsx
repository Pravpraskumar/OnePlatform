import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { BookmarkCheck, Check, ChevronDown, ChevronLeft, ChevronRight, Cloud, Columns3, FilterX, FolderOpen, Plus, RefreshCw, Search, Trash2, Unlink, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SalesforceAccountList, SalesforceOpportunityList, SalesforceOpportunitySummary } from '@platform/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ColumnFilter, formatValue, inferFilterKind, matchesFilter, type FilterKind, SalesforceSourceBadge } from './salesforceTable';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { useSession } from '@/state/SessionProvider';
import { Chip, OpportunityPreIttPanel } from './OpportunityPreIttPanel';
import { opportunityLifecycle, opportunityWorkspaceKey, parseWorkspaceSelection } from './opportunityWorkspace';

const PAGE_SIZE = 100;

const salesforceFieldColumns = [
  ['Opportunity_Number__c', 'Opportunity Number'],
  ['OpportunityName__c', 'Opportunity Name'],
  ['StageName', 'Stage'],
  ['ProductTypeSubCategory', 'Product Type (Floater/Subsea)'],
  ['Sub_Category_Product_Type__c', 'Sub-Category / Product Type'],
  ['Region__c', 'Region'],
  ['Country__c', 'Country'],
  ['priority__c', 'Priority'],
  ['CloseDate', 'Close Date'],
  ['Forecasted_Revenue__c', 'Forecasted Revenue'],
  ['Forecasted_Gross_Profit__c', 'Forecasted Gross Profit'],
  ['Id', 'Salesforce ID'],
  ['AccountId', 'Account ID'],
  ['RecordTypeId', 'Record Type ID'],
  ['Description', 'Description'],
  ['Bid_Project_Manager_Name__c', 'Bid Project Manager'],
  ['Bid_Submission_Date__c', 'Bid Submission Date'],
  ['Competitor_s_Bid_Price__c', "Competitor's Bid Price"],
  ['Estimating_Lead__c', 'Estimating Lead'],
  ['Forecast__c', 'Forecast'],
  ['Forecasted_Award_Date__c', 'Forecasted Award Date'],
  ['Get__c', 'Get'],
  ['Go__c', 'Go'],
  ['Opportunity_Owner_Name__c', 'Opportunity Owner'],
  ['P_E_Location__c', 'P&E Location'],
  ['Proposals_Lead__c', 'Proposals Lead'],
  ['RFP_Date__c', 'RFP Date'],
  ['SalesCategory__c', 'Sales Category'],
  ['Winning_bidder__c', 'Winning Bidder'],
  ['Exclude_from_Market_Analyst_Reports1__c', 'Exclude from Market Analyst Reports'],
  ['Gross_Profit_for_All__c', 'Gross Profit for All'],
  ['Total_Contract_Value_for_all__c', 'Total Contract Value for All'],
  ['Future_Opportunity_Placeholder__c', 'Future Opportunity Placeholder'],
  ['Project_used_for_Planning__c', 'Project Used for Planning'],
  ['Proposal_Submitted__c', 'Proposal Submitted'],
  ['Business_Line__c', 'Business Line'],
  ['Project_Typ__c', 'Project Type'],
  ['Bid_Slate__c', 'Bid Slate'],
  ['Binding2__c', 'Binding'],
  ['PG1_L1_Approved__c', 'PG1 L1 Approved'],
  ['PG1_L2_3_Approved__c', 'PG1 L2/3 Approved'],
  ['PG2_L1_Approved__c', 'PG2 L1 Approved'],
  ['PG2_L2_3_Approved__c', 'PG2 L2/3 Approved'],
  ['PG3_L1_Approved__c', 'PG3 L1 Approved'],
  ['PG3_L2_3_Approved__c', 'PG3 L2/3 Approved'],
  ['PG3_Post_Submission_System_Approved__c', 'PG3 Post-Submission System Approved'],
  ['PG4_Approved__c', 'PG4 Approved'],
  ['PG5_Approved__c', 'PG5 Approved'],
  ['ITT_Received__c', 'ITT Received'],
  ['Service_Agreement_Business_Line__c', 'Service Agreement Business Line'],
] as const;

type FieldKey = typeof salesforceFieldColumns[number][0];
const defaultColumns: FieldKey[] = [
  'Opportunity_Number__c', 'OpportunityName__c', 'StageName', 'ProductTypeSubCategory', 'Sub_Category_Product_Type__c',
  'Region__c', 'Country__c', 'priority__c', 'CloseDate', 'Forecasted_Revenue__c', 'Forecasted_Gross_Profit__c',
];
const labels = new Map<string, string>(salesforceFieldColumns);

function fieldValue(row: SalesforceOpportunitySummary, key: FieldKey) {
  return row.fields?.[key] ?? null;
}

const freeTextColumns = new Set<FieldKey>(['Id', 'AccountId', 'Opportunity_Number__c', 'OpportunityName__c', 'Description']);
const filterKind = (rows: SalesforceOpportunitySummary[], key: FieldKey): FilterKind => (
  inferFilterKind(rows.map((row) => fieldValue(row, key)), freeTextColumns.has(key))
);

function DetailsPanel({ row, onClose }: { row: SalesforceOpportunitySummary; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  const sync: Array<[string, ReactNode]> = [
    ['Salesforce stage (before rules)', formatValue(row.sourceStageName)],
    ['In latest extract', row.inExtract ? 'Yes' : 'No'],
    ['Last seen in Salesforce sync', new Date(row.lastSeenAt).toLocaleString()],
    ...(row.removedFromExtractAt ? [['Removed from extract', new Date(row.removedFromExtractAt).toLocaleString()] as [string, ReactNode]] : []),
  ];
  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-slate-950/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="salesforce-opportunity-details-title" className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-teal-700">{row.opportunityNumber}</p>
            <h2 id="salesforce-opportunity-details-title" className="mt-1 text-lg font-semibold text-slate-950">{row.opportunityName ?? 'Salesforce opportunity'}</h2>
            {!row.inExtract && <p className="mt-1 text-xs font-medium text-amber-700">Not in latest extract</p>}
          </div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close opportunity details" className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          <h3 className="text-xs font-semibold uppercase text-slate-500">Sync status</h3>
          <dl className="mt-2 grid grid-cols-[minmax(10rem,14rem)_1fr] gap-x-4 gap-y-2 text-sm">
            {sync.map(([label, value]) => <div key={label} className="contents"><dt className="text-slate-500">{label}</dt><dd className="text-slate-900">{value}</dd></div>)}
          </dl>
          <h3 className="mt-6 text-xs font-semibold uppercase text-slate-500">Salesforce fields</h3>
          <dl className="mt-2 grid grid-cols-[minmax(10rem,14rem)_1fr] gap-x-4 gap-y-2 text-sm">
            {salesforceFieldColumns.map(([key, label]) => (
              <div key={key} className="contents">
                <dt className="text-slate-500">{label}<span className="block font-mono text-[10px] text-slate-400">{key}</span></dt>
                <dd className={key === 'Description' ? 'whitespace-pre-wrap break-words text-slate-900' : 'break-words text-slate-900'}>{formatValue(fieldValue(row, key))}</dd>
              </div>
            ))}
          </dl>
        </div>
      </aside>
    </div>
  );
}

function ColumnChooser({ visible, onChange }: { visible: FieldKey[]; onChange: (columns: FieldKey[]) => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const onMouseDown = (event: MouseEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => { window.removeEventListener('keydown', onKeyDown); document.removeEventListener('mousedown', onMouseDown); };
  }, [open]);
  const toggle = (key: FieldKey) => {
    if (visible.includes(key)) {
      if (visible.length > 1) onChange(visible.filter((column) => column !== key));
    } else {
      onChange(salesforceFieldColumns.map(([column]) => column).filter((column) => column === key || visible.includes(column)));
    }
  };
  return (
    <div ref={container} className="relative">
      <Button type="button" variant="secondary" aria-expanded={open} aria-controls="salesforce-column-chooser" onClick={() => setOpen((value) => !value)}>
        <Columns3 size={16} />Columns ({visible.length}/{salesforceFieldColumns.length})
      </Button>
      {open && (
        <div id="salesforce-column-chooser" role="group" aria-label="Choose Salesforce columns" className="absolute right-0 z-40 mt-2 w-[min(42rem,90vw)] rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => onChange(salesforceFieldColumns.map(([column]) => column))}>Show all fields</Button>
            <Button type="button" variant="ghost" onClick={() => onChange(defaultColumns)}>Reset to key columns</Button>
          </div>
          <div className="grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2">
            {salesforceFieldColumns.map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                <input type="checkbox" checked={visible.includes(key)} disabled={visible.length === 1 && visible.includes(key)} onChange={() => toggle(key)} />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkspaceOpportunitySelector({ opportunities, activeOpportunity, disabled, onSelect }: {
  opportunities: SalesforceOpportunitySummary[];
  activeOpportunity: SalesforceOpportunitySummary | null;
  disabled: boolean;
  onSelect: (id: string) => void;
}) {
  const popupId = useId();
  const container = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const matches = opportunities.filter((row) => !term || [row.opportunityNumber, row.opportunityName, row.salesforceId, row.country, row.sourceStageName]
    .some((value) => value?.toLowerCase().includes(term)));

  function close() {
    setOpen(false);
    container.current?.querySelector('button')?.focus();
  }

  useEffect(() => {
    if (!open) return;
    searchInput.current?.focus();
    const onMouseDown = (event: MouseEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  return (
    <div ref={container} className="relative w-full max-w-xl" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
    }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
      <Button type="button" variant="secondary" disabled={disabled || opportunities.length === 0} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined}
        aria-label={`Select workspace opportunity${activeOpportunity ? `: ${activeOpportunity.opportunityNumber} ${activeOpportunity.opportunityName ?? ''}` : ''}`}
        className="h-11 w-full justify-between border border-slate-300 bg-white text-left hover:bg-slate-50"
        onClick={() => { setQuery(''); setOpen((current) => !current); }}>
        <span className="flex min-w-0 items-center gap-2"><FolderOpen size={16} className="shrink-0 text-teal-700" /><span className="truncate">{activeOpportunity ? `${activeOpportunity.opportunityNumber} - ${activeOpportunity.opportunityName ?? 'Unnamed opportunity'}` : 'Select opportunity'}</span></span>
        <ChevronDown size={16} className="shrink-0 text-slate-500" />
      </Button>
      {open && <div id={popupId} role="dialog" aria-label="Select workspace opportunity" className="absolute left-0 top-full z-40 mt-2 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
        <label className="relative block border-b border-slate-200 p-3">
          <span className="sr-only">Search selected opportunities</span>
          <Search size={16} className="pointer-events-none absolute left-6 top-6 text-slate-400" />
          <input ref={searchInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search opportunities" className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm" />
        </label>
        <div className="max-h-[min(20rem,45dvh)] overflow-y-auto p-1">
          {matches.map((row) => <button key={row.salesforceId} type="button" aria-pressed={activeOpportunity?.salesforceId === row.salesforceId}
            onClick={() => { onSelect(row.salesforceId); close(); }}
            className={`flex w-full items-start gap-3 rounded-md px-3 py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-700 ${activeOpportunity?.salesforceId === row.salesforceId ? 'bg-teal-50 text-teal-900' : 'text-slate-900 hover:bg-slate-50'}`}>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5"><b className="font-mono text-xs text-slate-900">{row.opportunityNumber}</b><Chip tone={opportunityLifecycle(row).phase === 'Post-ITT' ? 'post' : 'pre'}>{opportunityLifecycle(row).phase} · {row.sourceStageName ?? '—'}</Chip>{!row.inExtract && <Chip tone="out">Not in latest extract</Chip>}</span>
              <span className="mt-1 block truncate text-sm font-semibold" title={row.opportunityName ?? undefined}>{row.opportunityName ?? 'Unnamed opportunity'}</span>
              <span className="block text-xs text-slate-500">{row.country ?? 'Country not supplied'}</span>
              <span className="mt-1 flex gap-3 text-[11px] text-slate-500"><span>ITT {opportunityLifecycle(row).ittDate ?? '—'}</span><span>{row.fields.Opportunity_Owner_Name__c ? String(row.fields.Opportunity_Owner_Name__c) : 'Owner not supplied'}</span></span>
              <span aria-hidden="true" className="mt-1.5 flex gap-[3px]">{Array.from({ length: 7 }, (_, index) => <i key={index} className="h-[5px] flex-1 rounded-sm bg-slate-200" />)}</span>
            </span>
            {activeOpportunity?.salesforceId === row.salesforceId && <Check size={16} className="mt-1 shrink-0 text-teal-700" />}
          </button>)}
          {matches.length === 0 && <p role="status" className="px-3 py-6 text-sm text-slate-500">No selected opportunities match your search.</p>}
        </div>
        <p className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500">{matches.length} of {opportunities.length} selected opportunities</p>
      </div>}
    </div>
  );
}

function WorkspaceKpis({ rows, totalLoaded, lastSync }: { rows: SalesforceOpportunitySummary[]; totalLoaded: number; lastSync: SalesforceOpportunityList['lastSync'] }) {
  const phases = rows.map((row) => opportunityLifecycle(row));
  const pre = phases.filter((item) => item.phase === 'Pre-ITT');
  const post = phases.filter((item) => item.phase === 'Post-ITT');
  const cards: Array<[string, ReactNode, string]> = [
    ['My workspace', rows.length, `of ${totalLoaded} loaded · Salesforce`],
    ['Pre-ITT · Post-ITT', `${pre.length} · ${post.length}`, 'Stage from ITT date / receipt'],
    ['ITT within 60 days', pre.filter((item) => item.daysToItt !== null && item.daysToItt <= 60).length, 'Pre-ITT pursuits'],
    ['ITT receipt to confirm', post.filter((item) => !item.received).length, 'Expected ITT date passed'],
    ['ITT date required', phases.length - pre.length - post.length, 'No ITT date or receipt'],
    ['Last sync', lastSync ? new Date(lastSync.completedAt).toLocaleDateString() : '—', lastSync ? lastSync.status : 'Not synchronized'],
  ];
  return (
    <div aria-label="Workspace summary" className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map(([label, value, sub]) => (
        <div key={label} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
          <span aria-hidden="true" className="absolute -right-6 -top-6 h-[90px] w-[90px] rounded-full bg-indigo-50" />
          <span aria-hidden="true" className="absolute inset-x-3.5 bottom-0 h-[3px] rounded bg-gradient-to-r from-indigo-100 via-amber-100 to-emerald-100" />
          <small className="relative block text-[10.5px] font-semibold uppercase tracking-[0.07em] text-slate-600">{label}</small>
          <b className="relative my-1.5 block font-mono text-2xl text-slate-950">{value}</b>
          <span className="relative text-[11.5px] text-slate-600">{sub}</span>
        </div>
      ))}
    </div>
  );
}

export function CaptureProSalesforceOpportunitiesPage() {
  return <OpportunitiesScreen workspaceEnabled={false} />;
}

export function CaptureProOpportunityWorkspacePage() {
  return <OpportunitiesScreen workspaceEnabled />;
}

function OpportunitiesScreen({ workspaceEnabled }: { workspaceEnabled: boolean }) {
  const { selectedOrg } = useOrg();
  const { user } = useSession();
  if (!selectedOrg || !user) return <p role="alert">Select an organisation and sign in to view opportunities.</p>;
  return <OpportunityBrowser key={`${selectedOrg.id}:${user.id}:${workspaceEnabled}`} orgId={selectedOrg.id} userId={user.id} workspaceEnabled={workspaceEnabled} />;
}

function OpportunityBrowser({ orgId, userId, workspaceEnabled }: { orgId: string; userId: string; workspaceEnabled: boolean }) {
  const api = useApi();
  const storageKey = opportunityWorkspaceKey(orgId, userId);
  const [workspace, setWorkspace] = useState<{ ids: string[]; error: string }>(() => {
    if (!workspaceEnabled) return { ids: [], error: '' };
    try { return { ids: parseWorkspaceSelection(localStorage.getItem(storageKey)), error: '' }; }
    catch { return { ids: [], error: 'The opportunity workspace could not be read. Clear the saved selection before making changes.' }; }
  });
  const [view, setView] = useState<'all' | 'workspace'>(() => workspace.ids.length > 0 ? 'workspace' : 'all');
  const [workspaceStatus, setWorkspaceStatus] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [search, setSearch] = useState('');
  const [columns, setColumns] = useState<FieldKey[]>(defaultColumns);
  const [filters, setFilters] = useState<Partial<Record<FieldKey, string>>>({});
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<SalesforceOpportunitySummary | null>(null);
  const [data, setData] = useState<SalesforceOpportunityList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const showRemoved = includeRemoved || view === 'workspace';
  const workspaceIds = useMemo(() => new Set(workspace.ids), [workspace.ids]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    setSelected(null);
    const query = `orgId=${encodeURIComponent(orgId)}${showRemoved ? '&includeRemoved=true' : ''}`;
    api.capturePro<SalesforceOpportunityList>(`/salesforce-opportunities?${query}`)
      .then((result) => {
        if (!result || !Array.isArray(result.opportunities)) throw new Error('Capture-Pro returned an unexpected Salesforce opportunity response.');
        if (!cancelled) setData(result);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Salesforce opportunities could not be loaded.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, orgId, showRemoved, attempt]);

  useEffect(() => { setPage(0); }, [search, filters, includeRemoved, view]);

  const [accountNames, setAccountNames] = useState<{ names: Map<string, string>; error: string }>({ names: new Map(), error: '' });
  useEffect(() => {
    if (!workspaceEnabled) return;
    let cancelled = false;
    api.capturePro<SalesforceAccountList>(`/salesforce-accounts?orgId=${encodeURIComponent(orgId)}&includeRemoved=true`)
      .then((result) => {
        if (!result || !Array.isArray(result.accounts)) throw new Error('Unexpected Salesforce account response.');
        const names = new Map<string, string>();
        for (const account of result.accounts) if (account.name) names.set(account.salesforceId, account.name);
        if (!cancelled) setAccountNames({ names, error: '' });
      })
      .catch(() => { if (!cancelled) setAccountNames({ names: new Map(), error: 'Account names could not be loaded; Salesforce account IDs are shown instead.' }); });
    return () => { cancelled = true; };
  }, [api, orgId, workspaceEnabled, attempt]);

  function saveSelection(ids: string[]) {
    setWorkspaceStatus('');
    try {
      const validIds = parseWorkspaceSelection(JSON.stringify(ids));
      localStorage.setItem(storageKey, JSON.stringify(validIds));
      setWorkspace({ ids: validIds, error: '' });
      setWorkspaceStatus('My Workspace selection saved.');
    } catch {
      setWorkspace((current) => ({ ...current, error: 'The opportunity selection could not be saved in this browser. No selection changes were applied.' }));
    }
  }

  function clearSelection() {
    try {
      localStorage.removeItem(storageKey);
      setWorkspace({ ids: [], error: '' });
      setActiveId(null);
      setWorkspaceStatus('My Workspace selection cleared.');
    } catch { setWorkspace((current) => ({ ...current, error: 'The saved selection could not be cleared. Check browser storage permissions.' })); }
  }

  function switchView(next: 'all' | 'workspace') {
    setView(next);
    setSearch('');
    setFilters({});
    setSelected(null);
    setWorkspaceStatus('');
  }

  // Hidden columns must not keep filtering rows invisibly.
  const updateColumns = (next: FieldKey[]) => {
    setColumns(next);
    setFilters((current) => Object.fromEntries(Object.entries(current).filter(([key]) => next.includes(key as FieldKey))));
  };
  const kinds = useMemo(() => {
    const rows = data?.opportunities ?? [];
    return new Map(columns.map((key) => [key, filterKind(rows, key)] as const));
  }, [data, columns]);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const active = Object.entries(filters).filter(([, value]) => value) as Array<[FieldKey, string]>;
    return (data?.opportunities ?? []).filter((row) => (
      (view !== 'workspace' || workspaceIds.has(row.salesforceId))
      && (!term || columns.some((key) => String(formatValue(fieldValue(row, key))).toLowerCase().includes(term)))
      && active.every(([key, value]) => matchesFilter(fieldValue(row, key), value, kinds.get(key) ?? { type: 'text' }))
    ));
  }, [data, search, columns, filters, kinds, view, workspaceIds]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const activeOpportunity = filtered.find((row) => row.salesforceId === activeId) ?? filtered[0] ?? null;
  const unavailableIds = useMemo(() => {
    if (!data) return [];
    const availableIds = new Set(data.opportunities.map((row) => row.salesforceId));
    return workspace.ids.filter((id) => !availableIds.has(id));
  }, [data, workspace.ids]);

  return (
    <section aria-labelledby="salesforce-opportunities-heading" className="flex h-full min-h-0 flex-col">
      <header className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <SalesforceSourceBadge objectName="Opportunity" />
          <h1 id="salesforce-opportunities-heading" className="mt-1 text-2xl font-semibold text-slate-950">{workspaceEnabled ? 'Opportunity Workspace' : 'Salesforce Opportunities'}</h1>
          <p className="mt-1 text-xs text-slate-500">Subsea &amp; Floating Facilities · Commercially confidential</p>
        </div>
        {data?.lastSync && <p className="text-xs text-slate-500">Last sync: {data.lastSync.status} · {new Date(data.lastSync.completedAt).toLocaleString()}</p>}
      </header>
      {workspaceEnabled && <div role="tablist" aria-label="Opportunity views" className="mb-4 flex shrink-0 gap-6 border-b border-slate-200">
        <button id="my-workspace-tab" type="button" role="tab" aria-selected={view === 'workspace'} aria-controls="opportunity-view" onClick={() => switchView('workspace')} className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold ${view === 'workspace' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500'}`}><FolderOpen size={16} />My Workspace ({workspace.ids.length})</button>
        <button id="all-opportunities-tab" type="button" role="tab" aria-selected={view === 'all'} aria-controls="opportunity-view" onClick={() => switchView('all')} className={`flex items-center gap-2 border-b-2 pb-3 text-sm font-semibold ${view === 'all' ? 'border-teal-700 text-teal-800' : 'border-transparent text-slate-500'}`}><Cloud size={16} />All opportunities</button>
      </div>}
      {workspace.error && <div className="mb-3 flex shrink-0 flex-wrap items-center gap-3"><p role="alert" className="text-sm text-red-700">{workspace.error}</p><Button variant="secondary" onClick={clearSelection}><Trash2 size={16} />Clear saved selection</Button></div>}
      {workspaceStatus && <p role="status" className="mb-3 shrink-0 text-sm text-teal-800">{workspaceStatus}</p>}
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-4">
        {view === 'workspace' ? <WorkspaceOpportunitySelector opportunities={filtered} activeOpportunity={activeOpportunity} disabled={loading || !!error} onSelect={setActiveId} /> : <label className="relative block w-full max-w-sm">
          <span className="sr-only">Search Salesforce opportunities</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search visible columns" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
        </label>}
        {view === 'all' && <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={includeRemoved} onChange={(event) => setIncludeRemoved(event.target.checked)} />
          Show records no longer in the Salesforce extract
        </label>}
        <div className="ml-auto flex items-center gap-2">
          {view === 'workspace' && !loading && !error && activeOpportunity && <Button type="button" variant="ghost" disabled={!!workspace.error} onClick={() => saveSelection(workspace.ids.filter((id) => id !== activeOpportunity.salesforceId))}><Unlink size={16} />Remove from My Workspace</Button>}
          <Button type="button" variant="ghost" disabled={loading} onClick={() => setAttempt((value) => value + 1)} aria-label="Refresh data" title="Refresh data" className="px-2.5"><RefreshCw size={16} className={loading ? 'animate-spin' : undefined} /></Button>
          {view === 'workspace' && workspace.ids.length > 0 && <Button type="button" variant="ghost" onClick={clearSelection} aria-label="Clear My Workspace" title="Clear My Workspace"><Trash2 size={16} /></Button>}
          {activeFilterCount > 0 && (
            <Button type="button" variant="ghost" onClick={() => setFilters({})}><FilterX size={16} />Clear filters ({activeFilterCount})</Button>
          )}
          {view === 'all' && <ColumnChooser visible={columns} onChange={updateColumns} />}
        </div>
      </div>
      <div id="opportunity-view" role={workspaceEnabled ? 'tabpanel' : undefined} aria-labelledby={workspaceEnabled ? (view === 'all' ? 'all-opportunities-tab' : 'my-workspace-tab') : undefined} className="flex min-h-0 flex-1 flex-col">
      {loading ? <Card><p className="text-sm text-slate-500">Loading Salesforce opportunities...</p></Card>
        : error ? <Card><p role="alert" className="text-sm text-red-700">{error}</p><Button variant="secondary" className="mt-3" onClick={() => setAttempt((value) => value + 1)}>Retry loading opportunities</Button></Card>
          : view === 'workspace' ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <WorkspaceKpis rows={filtered} totalLoaded={data?.opportunities.filter((row) => row.inExtract).length ?? 0} lastSync={data?.lastSync ?? null} />
              {unavailableIds.length > 0 && <p role="status" className="mb-3 text-xs text-amber-800">{unavailableIds.length} selected opportunities are unavailable in the current Salesforce response.</p>}
              <div className="min-w-0">
                {accountNames.error && <p role="status" className="mb-3 text-xs text-amber-800">{accountNames.error}</p>}
                {activeOpportunity ? <OpportunityPreIttPanel row={activeOpportunity} accountName={accountNames.names.get(String(activeOpportunity.fields.AccountId ?? '')) ?? null} onDetails={() => setSelected(activeOpportunity)} /> : <div className="py-12"><FolderOpen size={28} className="text-teal-700" /><h2 className="mt-4 text-lg font-semibold">{workspace.ids.length === 0 ? 'No opportunities in My Workspace' : 'No selected opportunities match'}</h2><Button variant="secondary" className="mt-4" onClick={() => switchView('all')}><Plus size={16} />Browse Salesforce opportunities</Button></div>}
              </div>
            </div>
          ) : !data || data.opportunities.length === 0 ? (
            <Card>
              <Cloud size={20} className="text-teal-700" />
              <p className="mt-3 text-sm text-slate-600">No Salesforce opportunities have been synchronized for this organisation.</p>
              <p className="mt-1 text-xs text-slate-500">An integration administrator can run <Link to="/app/product/Capture-Pro/salesforce-sync" className="font-medium text-teal-700 hover:underline">Sync opportunities now</Link> from Sync &amp; Health.</p>
            </Card>
          ) : (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
              <div data-testid="salesforce-table-scroll" className="min-h-0 flex-1 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
                    <tr>{columns.map((key) => <th key={key} scope="col" className="whitespace-nowrap px-4 pb-1 pt-3">{labels.get(key)}</th>)}</tr>
                    <tr>
                      {columns.map((key) => (
                        <th key={key} scope="col" className="px-4 pb-2 pt-1 align-top">
                          <ColumnFilter
                            label={labels.get(key) ?? key}
                            kind={kinds.get(key) ?? { type: 'text' }}
                            value={filters[key] ?? ''}
                            onChange={(value) => setFilters((current) => ({ ...current, [key]: value }))}
                          />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageRows.map((row) => (
                      <tr key={row.id} onClick={() => setSelected(row)} className={`cursor-pointer hover:bg-teal-50/50 ${row.inExtract ? '' : 'bg-amber-50/60'}`}>
                        {columns.map((key, index) => {
                          const value = fieldValue(row, key);
                          const numeric = typeof value === 'number';
                          return (
                            <td key={key} className={`px-4 py-3 align-top ${numeric ? 'text-right tabular-nums' : ''} ${key === 'Description' ? 'max-w-md' : 'whitespace-nowrap'}`}>
                              {index === 0 ? (
                                <button type="button" onClick={(event) => { event.stopPropagation(); setSelected(row); }} aria-label={`View details for ${row.opportunityNumber}`} className="text-left font-medium text-teal-700 hover:underline">
                                  {formatValue(value)}
                                </button>
                              ) : key === 'Description' ? <span className="line-clamp-2">{formatValue(value)}</span> : formatValue(value)}
                              {key === 'StageName' && row.sourceStageName !== row.stageName && <span className="block text-xs text-slate-500">Salesforce: {formatValue(row.sourceStageName)}</span>}
                              {index === 0 && !row.inExtract && <span className="block text-xs font-medium text-amber-700">Not in latest extract</span>}
                              {workspaceEnabled && index === 0 && <button type="button" disabled={!!workspace.error} onClick={(event) => { event.stopPropagation(); saveSelection(workspace.ids.includes(row.salesforceId) ? workspace.ids.filter((id) => id !== row.salesforceId) : [...workspace.ids, row.salesforceId]); }} aria-label={workspace.ids.includes(row.salesforceId) ? `Remove ${row.opportunityNumber} from My Workspace` : `Add ${row.opportunityNumber} to My Workspace`} title={workspace.ids.includes(row.salesforceId) ? 'Remove from My Workspace' : 'Add to My Workspace'} className="ml-3 inline-flex h-7 w-7 items-center justify-center rounded border border-slate-200 text-teal-700 hover:bg-teal-100 disabled:opacity-50">{workspace.ids.includes(row.salesforceId) ? <BookmarkCheck size={16} /> : <Plus size={16} />}</button>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                <p>{filtered.length === 0 ? 'No opportunities match the search or filters.' : `Showing ${currentPage * PAGE_SIZE + 1}–${currentPage * PAGE_SIZE + pageRows.length} of ${filtered.length} opportunities`}</p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Previous page"><ChevronLeft size={16} /></Button>
                  <span>Page {currentPage + 1} of {pageCount}</span>
                  <Button type="button" variant="ghost" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} aria-label="Next page"><ChevronRight size={16} /></Button>
                </div>
              </div>
            </Card>
          )}
          </div>
      {selected && <DetailsPanel row={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
