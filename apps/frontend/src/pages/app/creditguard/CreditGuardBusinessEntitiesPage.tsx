import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import type { MenuNode, Product } from '@platform/shared';
import { Link, useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { notify } from '@/lib/systemEvents';
import { useOrg } from '@/state/OrgProvider';

interface BusinessEntity {
  id: string;
  jobCodeEntity: string;
  segment1: string;
  legalEntityName: string;
  ledgerName: string | null;
  inventoryOrgName: string | null;
  inventoryOrgCode: string | null;
  createdAt: string;
  updatedAt: string;
}

type BusinessEntityDraft = Omit<BusinessEntity, 'id' | 'createdAt' | 'updatedAt'>;
type FieldKey = keyof BusinessEntityDraft;

const route = '/app/product/CreditGuard/application-setup/business-entities';
const emptyDraft: BusinessEntityDraft = {
  jobCodeEntity: '',
  segment1: '',
  legalEntityName: '',
  ledgerName: '',
  inventoryOrgName: '',
  inventoryOrgCode: '',
};
const fields: { key: FieldKey; label: string; required?: boolean; width: string }[] = [
  { key: 'jobCodeEntity', label: 'Job Code Entity', required: true, width: 'min-w-32' },
  { key: 'segment1', label: 'Segment 1', required: true, width: 'min-w-28' },
  { key: 'legalEntityName', label: 'Legal Entity Name', required: true, width: 'min-w-72' },
  { key: 'ledgerName', label: 'Ledger Name', width: 'min-w-48' },
  { key: 'inventoryOrgName', label: 'Inventory Org Name', width: 'min-w-52' },
  { key: 'inventoryOrgCode', label: 'Inventory Org Code', width: 'min-w-52' },
];
const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-slate-100';

async function creditGuardRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/creditguard-api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(`CreditGuard API ${response.status}: ${await response.text()}`);
  return response.json() as Promise<T>;
}

function findMenu(nodes: MenuNode[]): MenuNode | undefined {
  for (const node of nodes) {
    if (node.route === route) return node;
    const child = findMenu(node.children);
    if (child) return child;
  }
  return undefined;
}

export function CreditGuardBusinessEntitiesPage() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const { setModuleName } = useOutletContext<{ setModuleName: (name: string | null) => void }>();
  const [rows, setRows] = useState<BusinessEntity[]>([]);
  const [draft, setDraft] = useState<BusinessEntityDraft>(emptyDraft);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<BusinessEntityDraft | null>(null);
  const [search, setSearch] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [accessChecked, setAccessChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setModuleName('CreditGuard');
    return () => setModuleName(null);
  }, [setModuleName]);

  useEffect(() => {
    setAccessChecked(false);
    setCanEdit(false);
    setError('');
    if (!selectedOrg) return;
    Promise.all([
      api.get<Product[]>(`/products?orgId=${encodeURIComponent(selectedOrg.id)}`),
      api.get<MenuNode[]>(`/menus/mine?orgId=${encodeURIComponent(selectedOrg.id)}`),
    ])
      .then(([products, menus]) => {
        if (!products.some((product) => product.code.toLowerCase() === 'creditguard')) {
          throw new Error('CreditGuard is not available for this organisation.');
        }
        const menu = findMenu(menus);
        if (!menu) throw new Error('You do not have access to Business Entities.');
        setCanEdit(menu.accessMode !== 'readonly');
      })
      .catch((requestError) => setError((requestError as Error).message))
      .finally(() => setAccessChecked(true));
  }, [api, selectedOrg]);

  const load = useCallback(() => {
    setLoading(true);
    creditGuardRequest<BusinessEntity[]>('/business-entities')
      .then(setRows)
      .catch((requestError) => setError((requestError as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (accessChecked && !error) load();
  }, [accessChecked, error, load]);

  const displayedRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => fields.some(({ key }) => String(row[key] ?? '').toLowerCase().includes(term)));
  }, [rows, search]);

  const create = async () => {
    setSaving(true);
    try {
      const created = await creditGuardRequest<BusinessEntity>('/business-entities', { method: 'POST', body: JSON.stringify(draft) });
      setRows((current) => [...current, created].sort((left, right) => left.jobCodeEntity.localeCompare(right.jobCodeEntity)));
      setDraft(emptyDraft);
      setAdding(false);
      notify('Business entity created.', 'success');
    } catch (requestError) {
      notify((requestError as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: BusinessEntity) => {
    setEditingId(row.id);
    setEditDraft(Object.fromEntries(fields.map(({ key }) => [key, row[key] ?? ''])) as BusinessEntityDraft);
  };

  const cancelCreate = () => {
    setAdding(false);
    setDraft(emptyDraft);
  };

  const saveEdit = async () => {
    if (!editingId || !editDraft) return;
    setSaving(true);
    try {
      const updated = await creditGuardRequest<BusinessEntity>(`/business-entities/${editingId}`, { method: 'PATCH', body: JSON.stringify(editDraft) });
      setRows((current) => current.map((row) => row.id === updated.id ? updated : row));
      setEditingId(null);
      setEditDraft(null);
      notify('Business entity updated.', 'success');
    } catch (requestError) {
      notify((requestError as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: BusinessEntity) => {
    if (!window.confirm(`Delete ${row.legalEntityName}?`)) return;
    try {
      await creditGuardRequest(`/business-entities/${row.id}`, { method: 'DELETE' });
      setRows((current) => current.filter((candidate) => candidate.id !== row.id));
      notify('Business entity deleted.', 'success');
    } catch (requestError) {
      notify((requestError as Error).message, 'error');
    }
  };

  if (!selectedOrg) return <Card><h1 className="text-xl font-semibold">Select an organisation</h1><p className="mt-2 text-sm text-slate-500">Choose an organisation before opening Business Entities.</p></Card>;
  if (!accessChecked) return <p className="text-sm text-slate-500">Checking Business Entities access...</p>;
  if (error) return <Card><h1 className="text-xl font-semibold">Unable to open Business Entities</h1><p className="mt-2 text-sm text-red-600">{error}</p><Link to="/app/product/CreditGuard" className="mt-4 inline-block text-sm font-medium text-brand">Back to CreditGuard</Link></Card>;

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">CreditGuard / Application Setup</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900"><Building2 size={24} />Business Entities</h1>
          <p className="mt-1 text-sm text-slate-500">Maintain legal entities and their ledger and inventory organisation mappings.</p>
        </div>
        {!canEdit && <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Read-only</span>}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {canEdit && <Button onClick={() => setAdding(true)} disabled={adding || !!editingId}><Plus size={16} />Add entity</Button>}
        <div className="relative min-w-64 flex-1 max-w-lg"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search business entities" className={`${inputClass} pl-9`} /></div>
        <span className="text-sm text-slate-500">{displayedRows.length} of {rows.length} entities</span>
      </div>

      <Card className="mt-4 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">{fields.map((field) => <th key={field.key} className={`${field.width} px-3 py-3 font-semibold`}>{field.label}</th>)}{canEdit && <th className="sticky right-0 min-w-24 bg-slate-50 px-3 py-3 text-right">Actions</th>}</tr></thead>
          <tbody>
            {adding && <tr className="border-b border-brand/30 bg-brand/5">{fields.map((field) => <td key={field.key} className="px-3 py-3 align-top"><input autoFocus={field.key === 'jobCodeEntity'} required={field.required} value={draft[field.key] ?? ''} onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.required ? `${field.label} *` : field.label} aria-label={field.label} className={inputClass} /></td>)}<td className="sticky right-0 bg-brand/5 px-3 py-2"><div className="flex justify-end gap-1"><button type="button" onClick={() => void create()} disabled={saving || !draft.jobCodeEntity.trim() || !draft.segment1.trim() || !draft.legalEntityName.trim()} className="rounded p-2 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40" title="Save new entity"><Save size={16} /></button><button type="button" onClick={cancelCreate} disabled={saving} className="rounded p-2 text-slate-500 hover:bg-slate-100" title="Cancel"><X size={16} /></button></div></td></tr>}
            {displayedRows.map((row) => {
              const editing = editingId === row.id;
              return <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/70">{fields.map((field) => <td key={field.key} className="px-3 py-3 align-top text-slate-700">{editing && editDraft ? <input required={field.required} value={editDraft[field.key] ?? ''} onChange={(event) => setEditDraft({ ...editDraft, [field.key]: event.target.value })} className={inputClass} /> : row[field.key] || <span className="text-slate-400">-</span>}</td>)}{canEdit && <td className="sticky right-0 bg-white px-3 py-2"><div className="flex justify-end gap-1">{editing ? <><button type="button" onClick={() => void saveEdit()} disabled={saving} className="rounded p-2 text-emerald-700 hover:bg-emerald-50" title="Save"><Save size={16} /></button><button type="button" onClick={() => { setEditingId(null); setEditDraft(null); }} className="rounded p-2 text-slate-500 hover:bg-slate-100" title="Cancel"><X size={16} /></button></> : <><button type="button" onClick={() => startEdit(row)} disabled={!!editingId} className="rounded p-2 text-slate-500 hover:bg-slate-100" title="Edit"><Pencil size={16} /></button><button type="button" onClick={() => void remove(row)} disabled={!!editingId} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 size={16} /></button></>}</div></td>}</tr>;
            })}
            {!loading && !adding && displayedRows.length === 0 && <tr><td colSpan={fields.length + (canEdit ? 1 : 0)} className="px-4 py-10 text-center text-slate-400">No business entities match the current search.</td></tr>}
            {loading && <tr><td colSpan={fields.length + (canEdit ? 1 : 0)} className="px-4 py-10 text-center text-slate-400">Loading business entities...</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}