import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FilterX, Search, Swords, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SalesforceCompetitorList, SalesforceCompetitorSummary } from '@platform/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { ColumnFilter, formatValue, inferFilterKind, matchesFilter, type FieldValue, type FilterKind, SalesforceSourceBadge } from './salesforceTable';

const PAGE_SIZE = 100;
const field = (row: SalesforceCompetitorSummary, key: string): FieldValue => row.fields?.[key] ?? null;
const opportunityLabel = (row: SalesforceCompetitorSummary): FieldValue => (
  row.opportunityNumber ? [row.opportunityNumber, row.opportunityName].filter(Boolean).join(' · ') : field(row, 'Opportunity__c')
);
const competitorLabel = (row: SalesforceCompetitorSummary): FieldValue => row.competitorAccountName ?? field(row, 'Competitor__c');

const columns: Array<{ key: string; label: string; apiName: string; freeText: boolean; value: (row: SalesforceCompetitorSummary) => FieldValue }> = [
  { key: 'competitorName', label: 'Competitor Name', apiName: 'Competitor_Name__c', freeText: true, value: (row) => field(row, 'Competitor_Name__c') },
  { key: 'competitor', label: 'Competitor', apiName: 'Competitor__c', freeText: false, value: competitorLabel },
  { key: 'opportunity', label: 'Opportunity', apiName: 'Opportunity__c', freeText: true, value: opportunityLabel },
  { key: 'won', label: 'Won', apiName: 'Won__c', freeText: false, value: (row) => field(row, 'Won__c') },
  { key: 'bidPrice', label: "Competitor's Bid Price", apiName: 'Competitor_s_Bid_Price__c', freeText: false, value: (row) => field(row, 'Competitor_s_Bid_Price__c') },
  { key: 'vessel', label: 'Competitor Vessel', apiName: 'Competitor_Vessel__c', freeText: false, value: (row) => field(row, 'Competitor_Vessel__c') },
  { key: 'yard', label: 'Competitor Yard', apiName: 'Competitor_Yard__c', freeText: false, value: (row) => field(row, 'Competitor_Yard__c') },
  { key: 'comments', label: 'Comments', apiName: 'Comments__c', freeText: true, value: (row) => field(row, 'Comments__c') },
  { key: 'salesforceId', label: 'Salesforce ID', apiName: 'Id', freeText: true, value: (row) => row.salesforceId },
];

function CompetitorDetails({ row, onClose }: { row: SalesforceCompetitorSummary; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  const fieldRows: Array<[string, string, FieldValue]> = [
    ['Salesforce ID', 'Id', row.salesforceId],
    ['Competitor Name', 'Competitor_Name__c', field(row, 'Competitor_Name__c')],
    ['Competitor', 'Competitor__c', field(row, 'Competitor__c')],
    ['Competitor account (synced)', '', row.competitorAccountName],
    ['Opportunity', 'Opportunity__c', field(row, 'Opportunity__c')],
    ['Opportunity (synced)', '', row.opportunityNumber ? [row.opportunityNumber, row.opportunityName].filter(Boolean).join(' · ') : null],
    ['Won', 'Won__c', field(row, 'Won__c')],
    ["Competitor's Bid Price", 'Competitor_s_Bid_Price__c', field(row, 'Competitor_s_Bid_Price__c')],
    ['Competitor Vessel', 'Competitor_Vessel__c', field(row, 'Competitor_Vessel__c')],
    ['Competitor Yard', 'Competitor_Yard__c', field(row, 'Competitor_Yard__c')],
    ['Comments', 'Comments__c', field(row, 'Comments__c')],
    ['In latest extract', '', row.inExtract],
    ['Last seen in Salesforce sync', '', new Date(row.lastSeenAt).toLocaleString()],
    ...(row.removedFromExtractAt ? [['Removed from extract', '', new Date(row.removedFromExtractAt).toLocaleString()] as [string, string, FieldValue]] : []),
  ];
  const title = String(field(row, 'Competitor_Name__c') ?? 'Salesforce competitor');
  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-slate-950/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="salesforce-competitor-details-title" className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-teal-700">{row.salesforceId}</p>
            <h2 id="salesforce-competitor-details-title" className="mt-1 text-lg font-semibold text-slate-950">{title}</h2>
            {!row.inExtract && <p className="mt-1 text-xs font-medium text-amber-700">Not in latest extract</p>}
          </div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close competitor details" className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </header>
        <dl className="grid grid-cols-[minmax(10rem,13rem)_1fr] gap-x-4 gap-y-3 overflow-y-auto p-5 text-sm">
          {fieldRows.map(([label, apiName, value]) => (
            <div key={label} className="contents">
              <dt className="text-slate-500">{label}{apiName && <span className="block font-mono text-[10px] text-slate-400">{apiName}</span>}</dt>
              <dd className={apiName === 'Comments__c' ? 'whitespace-pre-wrap break-words text-slate-900' : 'break-words text-slate-900'}>{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}

export function CaptureProSalesforceCompetitorsPage() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<SalesforceCompetitorSummary | null>(null);
  const [data, setData] = useState<SalesforceCompetitorList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedOrg) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    setSelected(null);
    const query = `orgId=${encodeURIComponent(selectedOrg.id)}${includeRemoved ? '&includeRemoved=true' : ''}`;
    api.capturePro<SalesforceCompetitorList>(`/salesforce-competitors?${query}`)
      .then((result) => {
        if (!result || !Array.isArray(result.competitors)) throw new Error('Capture-Pro returned an unexpected Salesforce competitor response.');
        if (!cancelled) setData(result);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Salesforce competitors could not be loaded.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, selectedOrg, includeRemoved]);

  useEffect(() => { setPage(0); }, [search, filters, includeRemoved, selectedOrg]);

  const kinds = useMemo(() => {
    const rows = data?.competitors ?? [];
    return new Map<string, FilterKind>(columns.map((column) => [column.key, inferFilterKind(rows.map(column.value), column.freeText)]));
  }, [data]);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const active = Object.entries(filters).filter(([, value]) => value);
    return (data?.competitors ?? []).filter((row) => (
      (!term || columns.some((column) => formatValue(column.value(row)).toLowerCase().includes(term)))
      && active.every(([key, value]) => {
        const column = columns.find((candidate) => candidate.key === key);
        return !column || matchesFilter(column.value(row), value, kinds.get(key) ?? { type: 'text' });
      })
    ));
  }, [data, search, filters, kinds]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <section aria-labelledby="salesforce-competitors-heading" className="flex h-full min-h-[36rem] flex-col">
      <header className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <SalesforceSourceBadge objectName="Project_Competitor_Details__c" />
          <h1 id="salesforce-competitors-heading" className="mt-1 text-2xl font-semibold text-slate-950">Salesforce Competitors</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Read-only Project Competitor Details from Salesforce, with linked opportunity and account names where those records are synced. Competitor bid prices are commercially confidential.</p>
        </div>
        {data?.lastSync && <p className="text-xs text-slate-500">Last sync: {data.lastSync.status} · {new Date(data.lastSync.completedAt).toLocaleString()}</p>}
      </header>
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-4">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Search Salesforce competitors</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search competitors" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={includeRemoved} onChange={(event) => setIncludeRemoved(event.target.checked)} />
          Show records no longer in Salesforce
        </label>
        {activeFilterCount > 0 && (
          <Button type="button" variant="ghost" className="ml-auto" onClick={() => setFilters({})}><FilterX size={16} />Clear filters ({activeFilterCount})</Button>
        )}
      </div>
      {loading ? <Card><p className="text-sm text-slate-500">Loading Salesforce competitors...</p></Card>
        : error ? <Card><p role="alert" className="text-sm text-red-700">{error}</p></Card>
          : !data || data.competitors.length === 0 ? (
            <Card>
              <Swords size={20} className="text-teal-700" />
              <p className="mt-3 text-sm text-slate-600">No Salesforce competitors have been synchronized for this organisation.</p>
              <p className="mt-1 text-xs text-slate-500">An integration administrator can run <Link to="/app/product/Capture-Pro/salesforce-sync" className="font-medium text-teal-700 hover:underline">Sync competitors now</Link> from Sync &amp; Health.</p>
            </Card>
          ) : (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
              <div data-testid="salesforce-competitors-scroll" className="min-h-0 flex-1 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
                    <tr>{columns.map((column) => <th key={column.key} scope="col" className="whitespace-nowrap px-4 pb-1 pt-3">{column.label}</th>)}</tr>
                    <tr>
                      {columns.map((column) => (
                        <th key={column.key} scope="col" className="px-4 pb-2 pt-1 align-top">
                          <ColumnFilter label={column.label} kind={kinds.get(column.key) ?? { type: 'text' }} value={filters[column.key] ?? ''} onChange={(value) => setFilters((current) => ({ ...current, [column.key]: value }))} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageRows.map((row) => (
                      <tr key={row.id} onClick={() => setSelected(row)} className={`cursor-pointer hover:bg-teal-50/50 ${row.inExtract ? '' : 'bg-amber-50/60'}`}>
                        {columns.map((column, index) => {
                          const value = column.value(row);
                          return (
                            <td key={column.key} className={`px-4 py-3 align-top ${typeof value === 'number' ? 'text-right tabular-nums' : ''} ${column.key === 'comments' ? 'max-w-md' : 'whitespace-nowrap'} ${column.key === 'salesforceId' ? 'font-mono text-xs' : ''}`}>
                              {index === 0 ? (
                                <button type="button" onClick={(event) => { event.stopPropagation(); setSelected(row); }} aria-label={`View details for ${formatValue(value)}`} className="text-left font-medium text-teal-700 hover:underline">
                                  {formatValue(value)}
                                </button>
                              ) : column.key === 'comments' ? <span className="line-clamp-2">{formatValue(value)}</span> : formatValue(value)}
                              {index === 0 && !row.inExtract && <span className="block text-xs font-medium text-amber-700">Not in latest extract</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                <p>{filtered.length === 0 ? 'No competitor records match the search or filters.' : `Showing ${currentPage * PAGE_SIZE + 1}–${currentPage * PAGE_SIZE + pageRows.length} of ${filtered.length} competitor records`}</p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Previous page"><ChevronLeft size={16} /></Button>
                  <span>Page {currentPage + 1} of {pageCount}</span>
                  <Button type="button" variant="ghost" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} aria-label="Next page"><ChevronRight size={16} /></Button>
                </div>
              </div>
            </Card>
          )}
      {selected && <CompetitorDetails row={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
