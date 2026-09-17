import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ClipboardCheck, Columns3, Pencil, Plus, Save, Search, UserCheck, Trash2, X } from 'lucide-react';
import type { Product } from '@platform/shared';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useProductSession } from '@/hooks/useProductSession';
import { useOrg } from '@/state/OrgProvider';
import { notify } from '@/lib/systemEvents';

type RequestStatus = 'Draft' | 'Under Review' | 'Reviewed' | 'Sent for Approval' | 'Approved' | 'Issued' | 'Rejected' | 'Closed';
type SortDirection = 'asc' | 'desc';

interface CreditGuardRequest {
  id: string;
  orgId: string;
  projectId: string | null;
  requestNumber: string;
  instrumentType: string;
  applicant: string;
  beneficiary: string;
  amount: number;
  currency: string;
  status: RequestStatus;
  requestedBy: string;
  dueDate: string | null;
  nextReviewDate: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

type RequestDraft = Omit<CreditGuardRequest, 'id' | 'createdAt' | 'updatedAt'>;
type ColumnKey = keyof Pick<CreditGuardRequest, 'requestNumber' | 'instrumentType' | 'beneficiary' | 'amount' | 'currency' | 'status' | 'requestedBy' | 'dueDate' | 'nextReviewDate' | 'notes' | 'updatedAt'>;

const columns: { key: ColumnKey; label: string; minWidth: string }[] = [
  { key: 'requestNumber', label: 'Request No.', minWidth: 'min-w-36' },
  { key: 'instrumentType', label: 'Instrument', minWidth: 'min-w-52' },
  { key: 'beneficiary', label: 'Beneficiary', minWidth: 'min-w-44' },
  { key: 'amount', label: 'Amount', minWidth: 'min-w-32' },
  { key: 'currency', label: 'Currency', minWidth: 'min-w-24' },
  { key: 'status', label: 'Status', minWidth: 'min-w-36' },
  { key: 'requestedBy', label: 'Requested by', minWidth: 'min-w-44' },
  { key: 'dueDate', label: 'Due date', minWidth: 'min-w-36' },
  { key: 'nextReviewDate', label: 'Next review date', minWidth: 'min-w-40' },
  { key: 'notes', label: 'Notes', minWidth: 'min-w-56' },
  { key: 'updatedAt', label: 'Updated', minWidth: 'min-w-44' },
];

const inputClass = 'w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand';

async function creditGuardRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/creditguard-api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(`CreditGuard API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

export function CreditGuardRequestsPage() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const navigate = useNavigate();
  const { setModuleName } = useOutletContext<{ setModuleName: (name: string | null) => void }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [projects, setProjects] = useState<{ id: string; code: string; name: string }[]>([]);
  const [projectId, setProjectId] = useState('');
  const [projectRequired, setProjectRequired] = useState(false);
  const [allocationChecked, setAllocationChecked] = useState(false);
  const [rows, setRows] = useState<CreditGuardRequest[]>([]);
  const [filters, setFilters] = useState<Partial<Record<ColumnKey, string>>>({});
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(new Set(columns.map((column) => column.key)));
  const [sort, setSort] = useState<{ key: ColumnKey; direction: SortDirection }>({ key: 'updatedAt', direction: 'desc' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<RequestDraft | null>(null);
  const [loadingRows, setLoadingRows] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setModuleName('CreditGuard');
    return () => setModuleName(null);
  }, [setModuleName]);

  useEffect(() => {
    setProduct(null);
    setAllocationChecked(false);
    if (!selectedOrg) return;
    api.get<Product[]>(`/products?orgId=${encodeURIComponent(selectedOrg.id)}`)
      .then((products) => {
        const creditGuard = products.find((candidate) => candidate.code.toLowerCase() === 'creditguard');
        if (!creditGuard) throw new Error('CreditGuard is not available for this organisation.');
        setProduct(creditGuard);
      })
      .catch((error) => setErrorMessage((error as Error).message));
  }, [api, selectedOrg]);

  useEffect(() => {
    setProjects([]);
    setProjectId('');
    setProjectRequired(false);
    setAllocationChecked(false);
    if (!selectedOrg || !product) return;
    api.get<{ projectRequired: boolean; lastProjectId: string | null; projects: { id: string; code: string; name: string }[] }>(`/organisations/${selectedOrg.id}/modules/${product.id}/projects`)
      .then((result) => {
        setProjects(result.projects);
        setProjectRequired(result.projectRequired);
        setProjectId(result.lastProjectId ?? '');
        setAllocationChecked(true);
      })
      .catch((error) => setErrorMessage((error as Error).message));
  }, [api, product, selectedOrg]);

  const { session, loading: sessionLoading, error: sessionError } = useProductSession(api, selectedOrg?.id, product?.id, product?.name, projectId || undefined, projectRequired, allocationChecked);

  useEffect(() => {
    if (!selectedOrg || !session || (projectRequired && !projectId)) {
      setRows([]);
      return;
    }
    setLoadingRows(true);
    setErrorMessage('');
    const query = new URLSearchParams({ orgId: selectedOrg.id });
    if (projectId) query.set('projectId', projectId);
    creditGuardRequest<CreditGuardRequest[]>(`/requests?${query}`)
      .then(setRows)
      .catch((error) => setErrorMessage((error as Error).message))
      .finally(() => setLoadingRows(false));
  }, [projectId, projectRequired, selectedOrg, session]);

  const displayedRows = useMemo(() => {
    const filtered = rows.filter((row) => columns.every(({ key }) => {
      const filter = filters[key]?.trim().toLowerCase();
      if (!filter) return true;
      return String(row[key] ?? '').toLowerCase().includes(filter);
    }));
    return [...filtered].sort((left, right) => {
      const leftValue = left[sort.key] ?? '';
      const rightValue = right[sort.key] ?? '';
      const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue));
      return sort.direction === 'asc' ? comparison : -comparison;
    });
  }, [filters, rows, sort]);

  const changeSort = (key: ColumnKey) => setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  const toggleColumn = (key: ColumnKey) => setVisibleColumns((current) => {
    const next = new Set(current);
    if (next.has(key) && next.size > 1) next.delete(key);
    else next.add(key);
    return next;
  });

  const startNew = () => {
    const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';
    navigate(`/app/product/CreditGuard/requests/new${query}`);
  };

  const startEdit = (row: CreditGuardRequest) => {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...values } = row;
    setEditingId(row.id);
    setDraft(values);
  };

  const save = async () => {
    if (!draft || !editingId) return;
    setSaving(true);
    setErrorMessage('');
    try {
      const saved = await creditGuardRequest<CreditGuardRequest>(`/requests/${editingId}`, { method: 'PATCH', body: JSON.stringify(draft) });
      setRows((current) => current.map((row) => row.id === saved.id ? saved : row));
      setEditingId(null);
      setDraft(null);
      notify('Request updated successfully.', 'success');
    } catch (error) {
      notify((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: CreditGuardRequest) => {
    if (!window.confirm(`Delete request ${row.requestNumber}?`)) return;
    try {
      await creditGuardRequest(`/requests/${row.id}?orgId=${encodeURIComponent(row.orgId)}`, { method: 'DELETE' });
      setRows((current) => current.filter((candidate) => candidate.id !== row.id));
      notify('Request deleted.', 'success');
    } catch (error) {
      notify((error as Error).message, 'error');
    }
  };

  const requestEditUrl = (row: CreditGuardRequest) =>
    `/app/product/CreditGuard/requests/${row.id}/edit${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
  const selectedRequest = rows.find((row) => row.id === selectedRequestId) ?? null;
  const assignApproversUrl = selectedRequest
    ? `/app/product/CreditGuard/requests/${selectedRequest.id}/approvers${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`
    : '';
  const approvalUrl = selectedRequest
    ? `/app/product/CreditGuard/requests/${selectedRequest.id}/approval${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`
    : '';

  const renderCell = (row: CreditGuardRequest, key: ColumnKey, editing: boolean) => {
    if (key === 'notes' && editing && draft) {
      return <input aria-label={`Notes for ${row.requestNumber}`} className={inputClass} value={draft.notes ?? ''} onChange={(event) => setDraft({ ...draft, notes: event.target.value || null })} />;
    }
    if (key === 'requestNumber') return <Link to={requestEditUrl(row)} className="font-medium text-brand underline-offset-2 hover:underline">{row.requestNumber}</Link>;
    if (key === 'amount') return new Intl.NumberFormat(undefined, { style: 'currency', currency: row.currency }).format(row.amount);
    if (key === 'updatedAt') return new Date(row.updatedAt).toLocaleString();
    if (key === 'status') return <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium">{row.status}</span>;
    return String(row[key] ?? '—');
  };

  if (!selectedOrg) return <Card><h1 className="text-xl font-semibold">Select an organisation</h1><p className="mt-2 text-sm text-slate-500">Choose an organisation before opening CreditGuard Requests.</p></Card>;
  if (errorMessage || sessionError) return <Card><h1 className="text-xl font-semibold">Unable to open Requests</h1><p className="mt-2 text-sm text-red-600">{errorMessage || sessionError}</p><Link to="/app/product/CreditGuard" className="mt-4 inline-block text-sm font-medium text-brand">Back to CreditGuard</Link></Card>;
  if (!product || !allocationChecked || sessionLoading || !session) return <p className="text-sm text-slate-500">Checking CreditGuard access...</p>;

  return (
    <div className="min-w-0">
      {projectRequired && (
        <div className="-mx-4 -mt-4 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 md:-mx-6 md:-mt-6 md:px-6">
          <div><p className="text-xs font-medium uppercase text-slate-500">CreditGuard</p><h1 className="text-lg font-semibold text-slate-900">Requests</h1></div>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-700">Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="min-w-64 rounded-md border border-slate-300 bg-white px-3 py-2 font-normal"><option value="" disabled>Select a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} ({project.code})</option>)}</select></label>
        </div>
      )}
      {projectRequired && !projectId ? <p className="text-sm text-slate-500">Select an assigned project to manage its requests.</p> : (
        <>
          {!projectRequired && <div><h1 className="text-2xl font-semibold text-slate-900">Requests</h1><p className="mt-1 text-sm text-slate-500">Create and manage CreditGuard financial security requests.</p></div>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button onClick={startNew} disabled={!!editingId}><Plus size={16} />New request</Button>
            <Button variant="secondary" disabled={selectedRequest?.status !== 'Reviewed'} onClick={() => assignApproversUrl && navigate(assignApproversUrl)}><UserCheck size={16} />Assign Approvers</Button>
            {selectedRequest && ['Reviewed', 'Sent for Approval'].includes(selectedRequest.status) && (
              <Button variant="secondary" onClick={() => navigate(approvalUrl)}>
                <ClipboardCheck size={16} />{selectedRequest.status === 'Reviewed' ? 'Initiate Approval' : 'Approval Status'}
              </Button>
            )}
            <span className="text-sm text-slate-500">{displayedRows.length} of {rows.length} requests</span>
            <details className="relative ml-auto">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"><Columns3 size={16} />Columns</summary>
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-md border border-slate-200 bg-white p-2 shadow-lg">{columns.map((column) => <label key={column.key} className="flex items-center gap-2 px-2 py-1.5 text-sm text-slate-700"><input type="checkbox" checked={visibleColumns.has(column.key)} onChange={() => toggleColumn(column.key)} className="accent-brand" />{column.label}</label>)}</div>
            </details>
          </div>

          <Card className="mt-4 overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                  <th className="w-12 px-3 py-2"><span className="sr-only">Select</span></th>
                  {columns.filter((column) => visibleColumns.has(column.key)).map((column) => <th key={column.key} className={`${column.minWidth} px-3 py-2`}><button type="button" onClick={() => changeSort(column.key)} className="flex w-full items-center justify-between gap-2 font-semibold">{column.label}{sort.key === column.key ? sort.direction === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} /> : <ArrowUpDown size={14} className="text-slate-300" />}</button></th>)}
                  <th className="sticky right-0 min-w-24 bg-slate-50 px-3 py-2 text-right">Actions</th>
                </tr>
                <tr className="border-b border-slate-200 bg-white">
                  <th className="px-3 py-2" />
                  {columns.filter((column) => visibleColumns.has(column.key)).map((column) => <th key={column.key} className="px-3 py-2"><div className="relative"><Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" /><input value={filters[column.key] ?? ''} onChange={(event) => setFilters((current) => ({ ...current, [column.key]: event.target.value }))} placeholder={`Filter ${column.label}`} className="w-full rounded border border-slate-200 py-1.5 pl-7 pr-2 text-xs font-normal outline-none focus:border-brand" /></div></th>)}
                  <th className="sticky right-0 bg-white px-3 py-2"><button type="button" onClick={() => setFilters({})} className="text-xs font-medium text-brand">Clear</button></th>
                </tr>
              </thead>
              <tbody>
                {displayedRows.map((row) => {
                  const editing = editingId === row.id;
                  const selected = selectedRequestId === row.id;
                  return <tr key={row.id} aria-selected={selected} onClick={(event) => { if (!(event.target as HTMLElement).closest('a, button, input, select, textarea, label, summary')) setSelectedRequestId((current) => current === row.id ? null : row.id); }} className={`cursor-pointer border-b border-slate-100 ${selected ? 'bg-brand/10 hover:bg-brand/15' : 'hover:bg-slate-50/70'}`}><td className="px-3 py-3"><input type="checkbox" checked={selected} onChange={() => setSelectedRequestId((current) => current === row.id ? null : row.id)} aria-label={`Select request ${row.requestNumber}`} className="h-4 w-4 accent-brand" /></td>{columns.filter((column) => visibleColumns.has(column.key)).map((column) => <td key={column.key} className="px-3 py-3 align-top text-slate-700">{renderCell(row, column.key, editing)}</td>)}<td className={`sticky right-0 px-3 py-2 ${selected ? 'bg-brand/10' : 'bg-white'}`}><div className="flex justify-end gap-1">{editing ? <><button type="button" onClick={() => void save()} disabled={saving} className="rounded p-2 text-emerald-700 hover:bg-emerald-50" title="Save"><Save size={16} /></button><button type="button" onClick={() => { setEditingId(null); setDraft(null); }} className="rounded p-2 text-slate-500 hover:bg-slate-100" title="Cancel"><X size={16} /></button></> : <><button type="button" onClick={() => startEdit(row)} disabled={!!editingId || ['Under Review', 'Reviewed', 'Sent for Approval'].includes(row.status)} className="rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40" title="Edit notes"><Pencil size={16} /></button><button type="button" onClick={() => void remove(row)} disabled={!!editingId || ['Under Review', 'Reviewed', 'Sent for Approval'].includes(row.status)} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" title="Delete"><Trash2 size={16} /></button></>}</div></td></tr>;
                })}
                {!loadingRows && displayedRows.length === 0 && <tr><td colSpan={visibleColumns.size + 2} className="px-4 py-10 text-center text-slate-400">No requests match the current filters.</td></tr>}
                {loadingRows && <tr><td colSpan={visibleColumns.size + 2} className="px-4 py-10 text-center text-slate-400">Loading requests...</td></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}