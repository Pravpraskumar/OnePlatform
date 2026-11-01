import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Columns3, FilterX, Search, X, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SalesforceDescribedRecordSummary, SalesforceFieldDefinition, SalesforceSyncRun } from '@platform/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { ColumnFilter, formatValue, inferFilterKind, matchesFilter, SalesforceSourceBadge, type FieldValue, type FilterKind } from './salesforceTable';

const PAGE_SIZE = 100;
const DEFAULT_CUSTOM_COLUMNS = 7;
const freeTextTypes = new Set(['id', 'reference', 'textarea', 'url', 'email', 'phone']);
const valueOf = (row: SalesforceDescribedRecordSummary, key: string): FieldValue => row.fields?.[key] ?? null;

/** Screen configuration for a Salesforce object whose fields are discovered on each sync. */
export interface DescribedObjectConfig {
  title: string;
  objectName: string;
  /** Capture-Pro list endpoint, for example `/salesforce-vessels`. */
  endpoint: string;
  responseKey: 'fabricationYards' | 'vessels';
  /** Kebab-case identifier used in element IDs and test IDs. */
  slug: string;
  singular: string;
  plural: string;
  description: string;
  icon: LucideIcon;
}

type DescribedList = { lastSync: SalesforceSyncRun | null; fieldDefinitions: SalesforceFieldDefinition[]; records: SalesforceDescribedRecordSummary[] };
type DescribedResponse = { lastSync: SalesforceSyncRun | null; fieldDefinitions?: unknown } & Partial<Record<DescribedObjectConfig['responseKey'], unknown>>;

// Fields come from the latest Salesforce describe, so the default view is Name, the first custom fields, and the Id.
function defaultColumns(definitions: SalesforceFieldDefinition[]) {
  const names = new Set(definitions.map((definition) => definition.name));
  const custom = definitions.filter((definition) => definition.name.endsWith('__c')).slice(0, DEFAULT_CUSTOM_COLUMNS).map((definition) => definition.name);
  return [...(names.has('Name') ? ['Name'] : []), ...custom, 'Id'];
}

function ColumnChooser({ config, definitions, visible, defaults, onChange }: {
  config: DescribedObjectConfig; definitions: SalesforceFieldDefinition[]; visible: string[]; defaults: string[]; onChange: (columns: string[]) => void;
}) {
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
  const toggle = (key: string) => {
    if (visible.includes(key)) {
      if (visible.length > 1) onChange(visible.filter((column) => column !== key));
    } else {
      onChange(definitions.map((definition) => definition.name).filter((column) => column === key || visible.includes(column)));
    }
  };
  const chooserId = `${config.slug.replace(/s$/, '')}-column-chooser`;
  return (
    <div ref={container} className="relative">
      <Button type="button" variant="secondary" aria-expanded={open} aria-controls={chooserId} onClick={() => setOpen((value) => !value)}>
        <Columns3 size={16} />Columns ({visible.length}/{definitions.length})
      </Button>
      {open && (
        <div id={chooserId} role="group" aria-label={`Choose ${config.singular} columns`} className="absolute right-0 z-40 mt-2 w-[min(42rem,90vw)] rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
          <div className="mb-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => onChange(definitions.map((definition) => definition.name))}>Show all fields</Button>
            <Button type="button" variant="ghost" onClick={() => onChange(defaults)}>Reset to key columns</Button>
          </div>
          <div className="grid max-h-80 gap-1 overflow-y-auto sm:grid-cols-2">
            {definitions.map((definition) => (
              <label key={definition.name} className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                <input type="checkbox" checked={visible.includes(definition.name)} disabled={visible.length === 1 && visible.includes(definition.name)} onChange={() => toggle(definition.name)} />
                {definition.label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RecordDetails({ config, row, definitions, onClose }: {
  config: DescribedObjectConfig; row: SalesforceDescribedRecordSummary; definitions: SalesforceFieldDefinition[]; onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  const statusRows: Array<[string, FieldValue]> = [
    ['In latest extract', row.inExtract],
    ['Last seen in Salesforce sync', new Date(row.lastSeenAt).toLocaleString()],
    ...(row.removedFromExtractAt ? [['Removed from extract', new Date(row.removedFromExtractAt).toLocaleString()] as [string, FieldValue]] : []),
  ];
  const titleId = `${config.slug.replace(/s$/, '')}-details-title`;
  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-slate-950/40" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="min-w-0">
            <p className="font-mono text-xs font-semibold text-teal-700">{row.salesforceId}</p>
            <h2 id={titleId} className="mt-1 text-lg font-semibold text-slate-950">{row.name ?? `Salesforce ${config.singular}`}</h2>
            {!row.inExtract && <p className="mt-1 text-xs font-medium text-amber-700">Not in latest extract</p>}
          </div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label={`Close ${config.singular} details`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </header>
        <dl className="grid grid-cols-[minmax(10rem,13rem)_1fr] gap-x-4 gap-y-3 overflow-y-auto p-5 text-sm">
          {definitions.map((definition) => (
            <div key={definition.name} className="contents">
              <dt className="text-slate-500">{definition.label}<span className="block font-mono text-[10px] text-slate-400">{definition.name}</span></dt>
              <dd className={definition.type === 'textarea' ? 'whitespace-pre-wrap break-words text-slate-900' : 'break-words text-slate-900'}>{formatValue(valueOf(row, definition.name))}</dd>
            </div>
          ))}
          {statusRows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-slate-500">{label}</dt>
              <dd className="break-words text-slate-900">{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      </aside>
    </div>
  );
}

export function SalesforceDescribedObjectPage({ config }: { config: DescribedObjectConfig }) {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const [includeRemoved, setIncludeRemoved] = useState(false);
  const [search, setSearch] = useState('');
  const [chosenColumns, setChosenColumns] = useState<string[] | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<SalesforceDescribedRecordSummary | null>(null);
  const [data, setData] = useState<DescribedList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { endpoint, responseKey, singular, plural } = config;

  useEffect(() => {
    if (!selectedOrg) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    setSelected(null);
    const query = `orgId=${encodeURIComponent(selectedOrg.id)}${includeRemoved ? '&includeRemoved=true' : ''}`;
    api.capturePro<DescribedResponse>(`${endpoint}?${query}`)
      .then((result) => {
        const records = result?.[responseKey];
        if (!result || !Array.isArray(records) || !Array.isArray(result.fieldDefinitions)) {
          throw new Error(`Capture-Pro returned an unexpected Salesforce ${singular} response.`);
        }
        if (!cancelled) {
          setData({
            lastSync: result.lastSync ?? null,
            fieldDefinitions: result.fieldDefinitions as SalesforceFieldDefinition[],
            records: records as SalesforceDescribedRecordSummary[],
          });
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : `Salesforce ${plural} could not be loaded.`);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, selectedOrg, includeRemoved, endpoint, responseKey, singular, plural]);

  useEffect(() => { setPage(0); }, [search, filters, includeRemoved, selectedOrg]);

  const definitions = useMemo(() => data?.fieldDefinitions ?? [], [data]);
  const definitionByName = useMemo(() => new Map(definitions.map((definition) => [definition.name, definition])), [definitions]);
  const defaults = useMemo(() => defaultColumns(definitions), [definitions]);
  // Field definitions can change between syncs; columns that no longer exist are dropped.
  const columns = useMemo(() => {
    const current = (chosenColumns ?? defaults).filter((name) => definitionByName.has(name));
    return current.length > 0 ? current : defaults.filter((name) => definitionByName.has(name));
  }, [chosenColumns, defaults, definitionByName]);
  const updateColumns = (next: string[]) => {
    setChosenColumns(next);
    setFilters((current) => Object.fromEntries(Object.entries(current).filter(([key]) => next.includes(key))));
  };
  const kinds = useMemo(() => {
    const rows = data?.records ?? [];
    return new Map<string, FilterKind>(columns.map((name) => [
      name, inferFilterKind(rows.map((row) => valueOf(row, name)), name === 'Name' || freeTextTypes.has(definitionByName.get(name)?.type ?? '')),
    ]));
  }, [data, columns, definitionByName]);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const active = Object.entries(filters).filter(([key, value]) => value && columns.includes(key));
    return (data?.records ?? []).filter((row) => (
      (!term || columns.some((name) => formatValue(valueOf(row, name)).toLowerCase().includes(term)))
      && active.every(([key, value]) => matchesFilter(valueOf(row, key), value, kinds.get(key) ?? { type: 'text' }))
    ));
  }, [data, search, filters, columns, kinds]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const Icon = config.icon;
  const headingId = `${config.slug}-heading`;

  return (
    <section aria-labelledby={headingId} className="flex h-full min-h-[36rem] flex-col">
      <header className="mb-4 flex shrink-0 flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <SalesforceSourceBadge objectName={config.objectName} />
          <h1 id={headingId} className="mt-2 text-2xl font-semibold text-slate-950">{config.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{config.description}</p>
        </div>
        {data?.lastSync && <p className="text-xs text-slate-500">Last sync: {data.lastSync.status} · {new Date(data.lastSync.completedAt).toLocaleString()}</p>}
      </header>
      <div className="mb-4 flex shrink-0 flex-wrap items-center gap-4">
        <label className="relative block w-full max-w-sm">
          <span className="sr-only">Search Salesforce {plural}</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-400" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search visible columns" className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" />
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={includeRemoved} onChange={(event) => setIncludeRemoved(event.target.checked)} />
          Show records no longer in Salesforce
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {activeFilterCount > 0 && (
            <Button type="button" variant="ghost" onClick={() => setFilters({})}><FilterX size={16} />Clear filters ({activeFilterCount})</Button>
          )}
          {definitions.length > 0 && <ColumnChooser config={config} definitions={definitions} visible={columns} defaults={defaults} onChange={updateColumns} />}
        </div>
      </div>
      {loading ? <Card><p className="text-sm text-slate-500">Loading Salesforce {plural}...</p></Card>
        : error ? <Card><p role="alert" className="text-sm text-red-700">{error}</p></Card>
          : !data || data.records.length === 0 || definitions.length === 0 ? (
            <Card>
              <Icon size={20} className="text-teal-700" />
              <p className="mt-3 text-sm text-slate-600">No Salesforce {plural} have been synchronized for this organisation.</p>
              <p className="mt-1 text-xs text-slate-500">An integration administrator can run <Link to="/app/product/Capture-Pro/salesforce-sync" className="font-medium text-teal-700 hover:underline">Sync {plural} now</Link> from Sync &amp; Health.</p>
            </Card>
          ) : (
            <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
              <div data-testid={`salesforce-${config.slug}-scroll`} className="min-h-0 flex-1 overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 shadow-[0_1px_0_0_#e2e8f0]">
                    <tr>{columns.map((name) => <th key={name} scope="col" className="whitespace-nowrap px-4 pb-1 pt-3">{definitionByName.get(name)?.label ?? name}</th>)}</tr>
                    <tr>
                      {columns.map((name) => (
                        <th key={name} scope="col" className="px-4 pb-2 pt-1 align-top">
                          <ColumnFilter label={definitionByName.get(name)?.label ?? name} kind={kinds.get(name) ?? { type: 'text' }} value={filters[name] ?? ''} onChange={(value) => setFilters((current) => ({ ...current, [name]: value }))} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageRows.map((row) => (
                      <tr key={row.id} onClick={() => setSelected(row)} className={`cursor-pointer hover:bg-teal-50/50 ${row.inExtract ? '' : 'bg-amber-50/60'}`}>
                        {columns.map((name, index) => {
                          const value = valueOf(row, name);
                          const type = definitionByName.get(name)?.type;
                          return (
                            <td key={name} className={`px-4 py-3 align-top ${typeof value === 'number' ? 'text-right tabular-nums' : ''} ${type === 'textarea' ? 'max-w-md' : 'whitespace-nowrap'} ${type === 'id' || type === 'reference' ? 'font-mono text-xs' : ''}`}>
                              {index === 0 ? (
                                <button type="button" onClick={(event) => { event.stopPropagation(); setSelected(row); }} aria-label={`View details for ${row.name ?? row.salesforceId}`} className="text-left font-medium text-teal-700 hover:underline">
                                  {formatValue(value)}
                                </button>
                              ) : type === 'textarea' ? <span className="line-clamp-2">{formatValue(value)}</span> : formatValue(value)}
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
                <p>{filtered.length === 0 ? `No ${plural} match the search or filters.` : `Showing ${currentPage * PAGE_SIZE + 1}–${currentPage * PAGE_SIZE + pageRows.length} of ${filtered.length} ${plural}`}</p>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Previous page"><ChevronLeft size={16} /></Button>
                  <span>Page {currentPage + 1} of {pageCount}</span>
                  <Button type="button" variant="ghost" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)} aria-label="Next page"><ChevronRight size={16} /></Button>
                </div>
              </div>
            </Card>
          )}
      {selected && <RecordDetails config={config} row={selected} definitions={definitions} onClose={() => setSelected(null)} />}
    </section>
  );
}
