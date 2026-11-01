import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Columns3, FilterX, RefreshCw, Search, Ship, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SpinergieCharterList, SpinergieSpecificationValue, SpinergieVesselList, SpinergieVesselSummary } from '@platform/shared';
import { Button } from '@/components/ui/Button';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { ColumnFilter, formatValue, inferFilterKind, matchesFilter, type FieldValue } from './salesforceTable';

const defaults = ['vessel', 'vesselType', 'vesselManager', 'dpSystem', 'loa', 'beam', 'pipelay', 'mainHoistCapacity'];
type Dataset = 'vessels' | 'charters';
type BrowserRecord = SpinergieVesselSummary & { rowId: string };
const views = {
  vessels: { title: 'Vessel Specifications', singular: 'vessel', detail: 'specifications', defaults },
  charters: { title: 'Vessel Charters', singular: 'charter', detail: 'charter details', defaults: ['vesselTitle', 'status', 'dateStart', 'dateEnd', 'duration', 'dayRate', 'dayRateCurrency', 'charterManager', 'charterOperator', 'country'] },
} as const;
const pageSize = 100;
const fieldLabels: Record<string, string> = { vessel: 'Vessel', vesselId: 'Vessel ID', imo: 'IMO', mmsi: 'MMSI', loa: 'LOA', dpSystem: 'DP system' };
const label = (key: string) => (fieldLabels[key]
  ?? key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (letter) => letter.toUpperCase()));
const valueOf = (value: SpinergieSpecificationValue | undefined): FieldValue => value === null || value === undefined ? null
  : typeof value === 'object' ? JSON.stringify(value) : value;

function VesselDetails({ vessel, dataset, onClose }: { vessel: BrowserRecord; dataset: Dataset; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = `spinergie-${dataset}-details-title`;
  const view = views[dataset];
  useEffect(() => { dialog.current?.showModal(); }, []);
  return (
    <dialog ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
      aria-labelledby={titleId} className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-4xl overflow-hidden rounded-lg border border-slate-200 p-0 shadow-xl backdrop:bg-slate-950/40">
      <div className="flex max-h-[85dvh] flex-col bg-white">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0"><p className="text-xs text-teal-700">Spinergie · {vessel.vesselId}</p><h2 id={titleId} className="mt-1 break-words text-lg font-semibold">{vessel.name ?? view.title}</h2><p className="mt-1 text-xs text-slate-500">Last seen: {new Date(vessel.lastSeenAt).toLocaleString()}</p>{!vessel.inExtract && <p className="mt-1 text-xs text-amber-800">Not in latest extract</p>}</div>
          <Button variant="ghost" aria-label={`Close vessel ${view.detail}`} title="Close" onClick={onClose} className="h-9 w-9 shrink-0 p-0"><X size={18} /></Button>
        </header>
        <dl className="grid min-h-0 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          {Object.entries(vessel.fields).map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-xs font-medium text-slate-500">{label(key)}<span className="ml-2 font-mono text-[10px]">{key}</span></dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{formatValue(valueOf(value))}</dd></div>)}
        </dl>
      </div>
    </dialog>
  );
}

export function CaptureProSpinergieVesselsPage() {
  const { selectedOrg } = useOrg();
  return selectedOrg ? <VesselBrowser key={selectedOrg.id} orgId={selectedOrg.id} dataset="vessels" /> : <p role="alert">Select an organisation to view Spinergie vessels.</p>;
}

export function CaptureProSpinergieChartersPage() {
  const { selectedOrg } = useOrg();
  return selectedOrg ? <VesselBrowser key={selectedOrg.id} orgId={selectedOrg.id} dataset="charters" /> : <p role="alert">Select an organisation to view Spinergie charters.</p>;
}

function VesselBrowser({ orgId, dataset }: { orgId: string; dataset: Dataset }) {
  const api = useApi();
  const view = views[dataset];
  const [data, setData] = useState<{ records: BrowserRecord[]; lastSync: SpinergieVesselList['lastSync'] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [search, setSearch] = useState('');
  const [columns, setColumns] = useState<string[]>([...view.defaults]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<BrowserRecord | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(''); setData(null); setSelected(null);
    api.capturePro<SpinergieVesselList | SpinergieCharterList>(`/spinergie-${dataset}?orgId=${encodeURIComponent(orgId)}&includeRemoved=${includeRemoved}`)
      .then((result) => {
        let records: BrowserRecord[];
        if (result && dataset === 'vessels' && 'vessels' in result && Array.isArray(result.vessels)) records = result.vessels.map((row) => ({ ...row, rowId: row.vesselId }));
        else if (result && dataset === 'charters' && 'charters' in result && Array.isArray(result.charters)) records = result.charters.map((row) => ({ ...row, rowId: row.charterId }));
        else throw new Error(`Capture-Pro returned an unexpected Spinergie ${dataset} response.`);
        if (!cancelled) setData({ records, lastSync: result.lastSync });
      }).catch((reason: unknown) => { if (!cancelled) setError(reason instanceof Error ? reason.message : `Spinergie ${dataset} could not be loaded.`); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, orgId, dataset, includeRemoved, attempt]);
  useEffect(() => { setPage(0); }, [search, filters, includeRemoved]);
  const fields = useMemo(() => [...new Set((data?.records ?? []).flatMap((vessel) => Object.keys(vessel.fields)))].sort(), [data]);
  const visibleColumns = columns.filter((key) => fields.includes(key));
  const kinds = new Map(visibleColumns.map((key) => [key, inferFilterKind((data?.records ?? []).map((vessel) => valueOf(vessel.fields[key])), ['vessel', 'vesselTitle', 'vesselId', 'imo', 'mmsi'].includes(key))]));
  const term = search.trim().toLowerCase();
  const filtered = (data?.records ?? []).filter((vessel) => (!term || JSON.stringify(vessel.fields).toLowerCase().includes(term))
    && Object.entries(filters).every(([key, value]) => !value || !visibleColumns.includes(key) || matchesFilter(valueOf(vessel.fields[key]), value, kinds.get(key) ?? { type: 'text' })));
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  function toggleColumn(key: string) {
    setColumns((current) => current.includes(key) ? current.length > 1 ? current.filter((column) => column !== key) : current : [...current, key]);
    setFilters((current) => Object.fromEntries(Object.entries(current).filter(([column]) => column !== key)));
  }
  return (
    <section aria-labelledby="spinergie-vessels-heading" className="flex h-full min-h-0 flex-col">
      <header className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
        <div><p className="flex items-center gap-1.5 text-xs font-semibold text-teal-700"><Ship size={15} />Spinergie</p><h1 id="spinergie-vessels-heading" className="mt-1 text-2xl font-semibold text-slate-950">{view.title}</h1></div>
        {data?.lastSync && <p className="text-xs text-slate-500">Last successful sync: {new Date(data.lastSync.completedAt).toLocaleString()}</p>}
      </header>
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-3">
        <label className="relative w-full max-w-sm"><span className="sr-only">Search Spinergie {dataset}</span><Search size={16} className="pointer-events-none absolute left-3 top-3 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={dataset === 'charters' ? 'Search vessels and charters' : 'Search vessels and specifications'} className="h-10 w-full rounded-md border border-slate-300 pl-9 pr-3 text-sm" /></label>
        <label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={includeRemoved} onChange={(event) => setIncludeRemoved(event.target.checked)} />Include {dataset} no longer in the extract</label>
        <div className="ml-auto flex items-center gap-2">
          {Object.values(filters).some(Boolean) && <Button variant="ghost" aria-label="Clear vessel filters" title="Clear filters" onClick={() => setFilters({})}><FilterX size={16} /></Button>}
          <Button variant="ghost" disabled={loading} aria-label={`Refresh Spinergie ${dataset}`} title="Refresh" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16} className={loading ? 'animate-spin' : undefined} /></Button>
          <details className="relative"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm"><Columns3 size={16} />Columns ({visibleColumns.length})</summary><div className="absolute right-0 z-30 mt-2 w-[min(24rem,85vw)] rounded-lg border border-slate-200 bg-white p-3 shadow-xl"><div className="mb-2 flex gap-2"><Button variant="ghost" onClick={() => { setColumns(fields); setFilters({}); }}>Show all</Button><Button variant="ghost" onClick={() => { setColumns([...view.defaults]); setFilters({}); }}>Reset</Button></div><div className="max-h-72 overflow-y-auto">{fields.map((key) => <label key={key} className="flex items-center gap-2 px-2 py-1 text-sm"><input type="checkbox" checked={columns.includes(key)} disabled={visibleColumns.length === 1 && columns.includes(key)} onChange={() => toggleColumn(key)} />{label(key)}</label>)}</div></div></details>
        </div>
      </div>
      {loading ? <p role="status" className="py-8 text-sm text-slate-500">Loading Spinergie {dataset}...</p> : error ? <div role="alert" className="py-6 text-sm text-red-700"><p>{error}</p><Button variant="secondary" className="mt-3" onClick={() => setAttempt((value) => value + 1)}>Retry</Button></div>
        : !data?.records.length ? <div className="py-8 text-sm text-slate-600"><p>No Spinergie {view.title.toLowerCase()} have been synchronized.</p><Link to="/app/product/Capture-Pro/salesforce-sync" className="mt-2 inline-block font-medium text-teal-700 underline">Sync &amp; Health</Link></div>
          : <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200">
            <div className="min-h-0 flex-1 overflow-auto"><table className="min-w-full text-sm" aria-label={`Spinergie ${view.title.toLowerCase()}`}><thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs text-slate-500"><tr><th scope="col" className="px-4 py-3">Details</th>{visibleColumns.map((key) => <th key={key} scope="col" className="whitespace-nowrap px-4 py-3">{label(key)}</th>)}</tr><tr><th /><>{visibleColumns.map((key) => <th key={key} className="px-4 pb-3"><ColumnFilter label={label(key)} value={filters[key] ?? ''} kind={kinds.get(key) ?? { type: 'text' }} onChange={(value) => setFilters((current) => ({ ...current, [key]: value }))} /></th>)}</></tr></thead><tbody className="divide-y divide-slate-100">{pageRows.map((vessel) => <tr key={vessel.rowId} className={!vessel.inExtract ? 'bg-amber-50/50' : 'hover:bg-slate-50'}><td className="whitespace-nowrap px-4 py-3"><button type="button" onClick={() => setSelected(vessel)} aria-label={`View ${view.detail} for ${vessel.name ?? vessel.vesselId}`} className="font-medium text-teal-700 underline">{vessel.vesselId}</button>{!vessel.inExtract && <span className="block text-xs text-amber-800">Not in latest extract</span>}</td>{visibleColumns.map((key) => <td key={key} className="max-w-xs truncate px-4 py-3" title={formatValue(valueOf(vessel.fields[key]))}>{formatValue(valueOf(vessel.fields[key]))}</td>)}</tr>)}{pageRows.length === 0 && <tr><td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-slate-500">No {dataset} match your filters.</td></tr>}</tbody></table></div>
            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-500"><span>{filtered.length} {dataset} · Page {currentPage + 1} of {pageCount}</span><div className="flex gap-2"><Button variant="ghost" disabled={currentPage === 0} aria-label={`Previous ${view.singular} page`} title="Previous page" onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></Button><Button variant="ghost" disabled={currentPage + 1 >= pageCount} aria-label={`Next ${view.singular} page`} title="Next page" onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></Button></div></footer>
          </div>}
      {selected && <VesselDetails vessel={selected} dataset={dataset} onClose={() => setSelected(null)} />}
    </section>
  );
}