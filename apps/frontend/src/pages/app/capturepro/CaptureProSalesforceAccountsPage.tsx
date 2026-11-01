import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, FilterX, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SalesforceAccountList, SalesforceAccountSummary } from '@platform/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { ColumnFilter, formatValue, inferFilterKind, matchesFilter, type FilterKind, SalesforceSourceBadge } from './salesforceTable';

const PAGE_SIZE = 100;
const columns = [
  { key: 'name', label: 'Account Name', freeText: true },
  { key: 'type', label: 'Type', freeText: false },
  { key: 'companyShortName', label: 'Company Short Name', freeText: false },
  { key: 'salesforceId', label: 'Salesforce ID', freeText: true },
] as const;
type ColumnKey = typeof columns[number]['key'];

function AccountDetails({ row, onClose }: { row: SalesforceAccountSummary; onClose: () => void }) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  const details: Array<[string, string, string]> = [
    ['Account Name', 'Name', formatValue(row.name)],
    ['Type', 'Type', formatValue(row.type)],
    ['Company Short Name', 'Company_Short_Name__c', formatValue(row.companyShortName)],
    ['Salesforce ID', 'Id', row.salesforceId],
    ['In latest extract', '', row.inExtract ? 'Yes' : 'No'],
    ['Last seen in Salesforce sync', '', new Date(row.lastSeenAt).toLocaleString()],
    ...(row.removedFromExtractAt ? [['Removed from extract', '', new Date(row.removedFromExtractAt).toLocaleString()] as [string, string, string]] : []),
  ];
  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-slate-950/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby="salesforce-account-details-title" className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-teal-700">{row.salesforceId}</p>
            <h2 id="salesforce-account-details-title" className="mt-1 text-lg font-semibold text-slate-950">{row.name ?? 'Salesforce account'}</h2>
            {!row.inExtract && <p className="mt-1 text-xs font-medium text-amber-700">Not in latest extract</p>}
          </div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label="Close account details" className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </header>
        <dl className="grid grid-cols-[minmax(9rem,12rem)_1fr] gap-x-4 gap-y-3 overflow-y-auto p-5 text-sm">
          {details.map(([label, apiName, value]) => (
            <div key={label} className="contents">
              <dt className="text-slate-500">{label}{apiName && <span className="block font-mono text-[10px] text-slate-400">{apiName}</span>}</dt>
              <dd className="break-words text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}

export function CaptureProSalesforceAccountsPage() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Partial<Record<ColumnKey, string>>>({});
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<SalesforceAccountSummary | null>(null);
  const [data, setData] = useState<SalesforceAccountList | null>(null);
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
    api.capturePro<SalesforceAccountList>(`/salesforce-accounts?${query}`)
      .then((result) => {
        if (!result || !Array.isArray(result.accounts)) throw new Error('Capture-Pro returned an unexpected Salesforce account response.');
        if (!cancelled) setData(result);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Salesforce accounts could not be loaded.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, selectedOrg, includeRemoved]);

  useEffect(() => { setPage(0); }, [search, filters, includeRemoved, selectedOrg]);

  const kinds = useMemo(() => {
    const rows = data?.accounts ?? [];
    return new Map<ColumnKey, FilterKind>(columns.map(({ key, freeText }) => [key, inferFilterKind(rows.map((row) => row[key]), freeText)]));
  }, [data]);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const active = Object.entries(filters).filter(([, value]) => value) as Array<[ColumnKey, string]>;
    return (data?.accounts ?? []).filter((row) => (
      (!term || columns.some(({ key }) => formatValue(row[key]).toLowerCase().includes(term)))
      && active.every(([key, value]) => matchesFilter(row[key], value, kinds.get(key) ?? { type: 'text' }))
    ));
  }, [data, search, filters, kinds]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  return (
    <section aria-labelledby="salesforce-accounts-heading" className="flex h-full min-h-[36rem] flex-col">
      <header className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <SalesforceSourceBadge objectName="Account" />
          <h1 id="salesforce-accounts-heading" className="mt-1 text-2xl font-semibold text-slate-950">Salesforce Accounts</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Read-only Salesforce Accounts (Id, Name, Type, Company Short Name) imported by the latest account sync. Filter each column, or open a row to see its details.</p>
        </div>
        {data?.lastSync && <p className="text-xs text-slate-500">Last sync: {data.lastSync.status} · {new Date(data.lastSync.completedAt).toLocaleString()}</p>}
      </header>
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-4">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Search Salesforce accounts</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search accounts" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={includeRemoved} onChange={(event) => setIncludeRemoved(event.target.checked)} />
          Show accounts no longer in Salesforce
        </label>
        {activeFilterCount > 0 && (
          <Button type="button" variant="ghost" className="ml-auto" onClick={() => setFilters({})}><FilterX size={16} />Clear filters ({activeFilterCount})</Button>
        )}
      </div>
      {loading ? <Card><p className="text-sm text-slate-500">Loading Salesforce accounts...</p></Card>
        : error ? <Card><p role="alert" className="text-sm text-red-700">{error}</p></Card>
          : !data || data.accounts.length === 0 ? (
            <Card>
              <Building2 size={20} className="text-teal-700" />
              <p className="mt-3 text-sm text-slate-600">No Salesforce accounts have been synchronized for this organisation.</p>
              <p className="mt-1 text-xs text-slate-500">An integration administrator can run <Link to="/app/product/Capture-Pro/salesforce-sync" className="font-medium text-teal-700 hover:underline">Sync accounts now</Link> from Sync &amp; Health.</p>
            </Card>
          ) : (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
              <div data-testid="salesforce-accounts-scroll" className="min-h-0 flex-1 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
                    <tr>{columns.map(({ key, label }) => <th key={key} scope="col" className="whitespace-nowrap px-4 pb-1 pt-3">{label}</th>)}</tr>
                    <tr>
                      {columns.map(({ key, label }) => (
                        <th key={key} scope="col" className="px-4 pb-2 pt-1 align-top">
                          <ColumnFilter label={label} kind={kinds.get(key) ?? { type: 'text' }} value={filters[key] ?? ''} onChange={(value) => setFilters((current) => ({ ...current, [key]: value }))} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageRows.map((row) => (
                      <tr key={row.id} onClick={() => setSelected(row)} className={`cursor-pointer hover:bg-teal-50/50 ${row.inExtract ? '' : 'bg-amber-50/60'}`}>
                        <td className="px-4 py-3 align-top">
                          <button type="button" onClick={(event) => { event.stopPropagation(); setSelected(row); }} aria-label={`View details for ${row.name ?? row.salesforceId}`} className="text-left font-medium text-teal-700 hover:underline">
                            {formatValue(row.name)}
                          </button>
                          {!row.inExtract && <span className="block text-xs font-medium text-amber-700">Not in latest extract</span>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">{formatValue(row.type)}</td>
                        <td className="whitespace-nowrap px-4 py-3 align-top">{formatValue(row.companyShortName)}</td>
                        <td className="whitespace-nowrap px-4 py-3 align-top font-mono text-xs">{row.salesforceId}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                <p>{filtered.length === 0 ? 'No accounts match the search or filters.' : `Showing ${currentPage * PAGE_SIZE + 1}–${currentPage * PAGE_SIZE + pageRows.length} of ${filtered.length} accounts`}</p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Previous page"><ChevronLeft size={16} /></Button>
                  <span>Page {currentPage + 1} of {pageCount}</span>
                  <Button type="button" variant="ghost" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} aria-label="Next page"><ChevronRight size={16} /></Button>
                </div>
              </div>
            </Card>
          )}
      {selected && <AccountDetails row={selected} onClose={() => setSelected(null)} />}
    </section>
  );
}
