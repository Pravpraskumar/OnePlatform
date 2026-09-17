import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Save, Trash2, UserCheck, UsersRound, X } from 'lucide-react';
import type { MenuNode, Product } from '@platform/shared';
import { Link, useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { notify } from '@/lib/systemEvents';
import { useOrg } from '@/state/OrgProvider';

interface ModuleUser {
  id: string;
  displayName: string;
  email: string;
  roles: string[];
}

interface Approver {
  id: string;
  orgId: string;
  name: string;
  email: string;
  createdAt: string;
  updatedAt: string;
}

type ApproverDraft = Pick<Approver, 'name' | 'email'>;
type ActiveTab = 'registered-users' | 'approvers';

const route = '/app/product/CreditGuard/application-setup/module-users';
const emptyApprover: ApproverDraft = { name: '', email: '' };
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

export function CreditGuardModuleUsersPage() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const { setModuleName } = useOutletContext<{ setModuleName: (name: string | null) => void }>();
  const [activeTab, setActiveTab] = useState<ActiveTab>('approvers');
  const [productId, setProductId] = useState('');
  const [moduleUsers, setModuleUsers] = useState<ModuleUser[]>([]);
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [roleFilter, setRoleFilter] = useState('');
  const [addingApprover, setAddingApprover] = useState(false);
  const [approverDraft, setApproverDraft] = useState<ApproverDraft>(emptyApprover);
  const [editingApproverId, setEditingApproverId] = useState<string | null>(null);
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
    setProductId('');
    setError('');
    if (!selectedOrg) return;
    Promise.all([
      api.get<Product[]>(`/products?orgId=${encodeURIComponent(selectedOrg.id)}`),
      api.get<MenuNode[]>(`/menus/mine?orgId=${encodeURIComponent(selectedOrg.id)}`),
    ])
      .then(([products, menus]) => {
        const product = products.find((candidate) => candidate.code.toLowerCase() === 'creditguard');
        if (!product) throw new Error('CreditGuard is not available for this organisation.');
        const menu = findMenu(menus);
        if (!menu) throw new Error('You do not have access to Module Users.');
        setProductId(product.id);
        setCanEdit(menu.accessMode !== 'readonly');
      })
      .catch((requestError) => setError((requestError as Error).message))
      .finally(() => setAccessChecked(true));
  }, [api, selectedOrg]);

  const load = useCallback(async () => {
    if (!selectedOrg || !productId) return;
    setLoading(true);
    setError('');
    try {
      const [users, approverRows] = await Promise.all([
        api.get<ModuleUser[]>(`/organisations/${selectedOrg.id}/modules/${productId}/users`),
        creditGuardRequest<Approver[]>(`/approvers?orgId=${encodeURIComponent(selectedOrg.id)}`),
      ]);
      setModuleUsers(users);
      setApprovers(approverRows);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api, productId, selectedOrg]);

  useEffect(() => {
    if (accessChecked && productId && !error) void load();
  }, [accessChecked, error, load, productId]);

  const startApproverEdit = (approver: Approver) => {
    setEditingApproverId(approver.id);
    setApproverDraft({ name: approver.name, email: approver.email });
  };

  const cancelApproverEdit = () => {
    setAddingApprover(false);
    setEditingApproverId(null);
    setApproverDraft(emptyApprover);
  };

  const saveApprover = async () => {
    if (!selectedOrg) return;
    setSaving(true);
    try {
      const body = JSON.stringify({ ...approverDraft, orgId: selectedOrg.id });
      const saved = editingApproverId
        ? await creditGuardRequest<Approver>(`/approvers/${editingApproverId}`, { method: 'PATCH', body })
        : await creditGuardRequest<Approver>('/approvers', { method: 'POST', body });
      setApprovers((current) => {
        const rows = editingApproverId ? current.map((approver) => approver.id === saved.id ? saved : approver) : [...current, saved];
        return rows.sort((left, right) => left.name.localeCompare(right.name) || left.email.localeCompare(right.email));
      });
      notify(editingApproverId ? 'Approver updated.' : 'Approver created.', 'success');
      cancelApproverEdit();
    } catch (requestError) {
      notify((requestError as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeApprover = async (approver: Approver) => {
    if (!selectedOrg || !window.confirm(`Delete ${approver.name}?`)) return;
    try {
      await creditGuardRequest(`/approvers/${approver.id}?orgId=${encodeURIComponent(selectedOrg.id)}`, { method: 'DELETE' });
      setApprovers((current) => current.filter((candidate) => candidate.id !== approver.id));
      notify('Approver deleted.', 'success');
    } catch (requestError) {
      notify((requestError as Error).message, 'error');
    }
  };

  const availableRoles = [...new Set(moduleUsers.flatMap((moduleUser) => moduleUser.roles))].sort();
  const filteredModuleUsers = roleFilter
    ? moduleUsers.filter((moduleUser) => moduleUser.roles.includes(roleFilter))
    : moduleUsers;

  if (!selectedOrg) return <Card><h1 className="text-xl font-semibold">Select an organisation</h1><p className="mt-2 text-sm text-slate-500">Choose an organisation before opening Module Users.</p></Card>;
  if (!accessChecked) return <p className="text-sm text-slate-500">Checking Module Users access...</p>;
  if (error && !productId) return <Card><h1 className="text-xl font-semibold">Unable to open Module Users</h1><p className="mt-2 text-sm text-red-600">{error}</p><Link to="/app/product/CreditGuard" className="mt-4 inline-block text-sm font-medium text-brand">Back to CreditGuard</Link></Card>;

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">CreditGuard / Application Setup</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900"><UsersRound size={24} />Module Users</h1>
          <p className="mt-1 text-sm text-slate-500">View module access and maintain CreditGuard approval contacts for {selectedOrg.name}.</p>
        </div>
        {!canEdit && <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Read-only</span>}
      </div>

      <div className="mt-6 flex overflow-x-auto border-b border-slate-200" role="tablist" aria-label="Module user sections">
        <button type="button" role="tab" aria-selected={activeTab === 'approvers'} onClick={() => setActiveTab('approvers')} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${activeTab === 'approvers' ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><UserCheck size={16} />Approvers</button>
        <button type="button" role="tab" aria-selected={activeTab === 'registered-users'} onClick={() => setActiveTab('registered-users')} className={`flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${activeTab === 'registered-users' ? 'border-brand text-brand' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><UsersRound size={16} />Registered Users</button>
      </div>

      {error && productId && <Card className="mt-5"><p className="text-sm text-red-600">{error}</p><Button className="mt-4" variant="secondary" onClick={() => void load()}>Try again</Button></Card>}

      {!error && activeTab === 'registered-users' && (
        <Card className="mt-5 p-0">
          <div className="flex justify-end border-b border-slate-200 p-4">
            <label className="text-sm font-medium text-slate-700">Role<select aria-label="Filter registered users by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)} className="ml-2 rounded-md border border-slate-300 bg-white px-3 py-2 font-normal"><option value="">All roles</option>{availableRoles.map((role) => <option key={role} value={role}>{role}</option>)}</select></label>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600"><th className="px-4 py-3 font-semibold">Name</th><th className="px-4 py-3 font-semibold">Email</th><th className="min-w-64 px-4 py-3 font-semibold">Assigned roles</th></tr></thead>
            <tbody>
              {filteredModuleUsers.map((moduleUser) => <tr key={moduleUser.id} className="border-b border-slate-100"><td className="px-4 py-3 font-medium text-slate-800">{moduleUser.displayName}</td><td className="px-4 py-3 text-slate-600">{moduleUser.email}</td><td className="px-4 py-3 text-slate-700">{moduleUser.roles.length > 0 ? moduleUser.roles.join(', ') : <span className="text-slate-400">No CreditGuard role assigned</span>}</td></tr>)}
              {!loading && filteredModuleUsers.length === 0 && <tr><td colSpan={3} className="px-4 py-10 text-center text-slate-400">{roleFilter ? 'No registered users match this role.' : 'No active users are assigned to this module.'}</td></tr>}
              {loading && <tr><td colSpan={3} className="px-4 py-10 text-center text-slate-400">Loading registered users...</td></tr>}
            </tbody>
          </table>
          </div>
        </Card>
      )}

      {!error && activeTab === 'approvers' && (
        <>
          {canEdit && <div className="mt-5"><Button onClick={() => { setAddingApprover(true); setEditingApproverId(null); setApproverDraft(emptyApprover); }} disabled={addingApprover || !!editingApproverId}><Plus size={16} />Add approver</Button></div>}
          <Card className="mt-4 overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600"><th className="min-w-56 px-4 py-3 font-semibold">Name</th><th className="min-w-72 px-4 py-3 font-semibold">Email</th>{canEdit && <th className="w-24 px-4 py-3 text-right font-semibold">Actions</th>}</tr></thead>
              <tbody>
                {addingApprover && <ApproverEditor draft={approverDraft} setDraft={setApproverDraft} saving={saving} save={saveApprover} cancel={cancelApproverEdit} />}
                {approvers.map((approver) => editingApproverId === approver.id
                  ? <ApproverEditor key={approver.id} draft={approverDraft} setDraft={setApproverDraft} saving={saving} save={saveApprover} cancel={cancelApproverEdit} />
                  : <tr key={approver.id} className="border-b border-slate-100"><td className="px-4 py-3 font-medium text-slate-800">{approver.name}</td><td className="px-4 py-3 text-slate-600">{approver.email}</td>{canEdit && <td className="px-4 py-2"><div className="flex justify-end gap-1"><button type="button" onClick={() => startApproverEdit(approver)} disabled={addingApprover || !!editingApproverId} className="rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40" title="Edit approver"><Pencil size={16} /></button><button type="button" onClick={() => void removeApprover(approver)} disabled={addingApprover || !!editingApproverId} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40" title="Delete approver"><Trash2 size={16} /></button></div></td>}</tr>)}
                {!loading && !addingApprover && approvers.length === 0 && <tr><td colSpan={canEdit ? 3 : 2} className="px-4 py-10 text-center text-slate-400">No approvers have been added for this organisation.</td></tr>}
                {loading && <tr><td colSpan={canEdit ? 3 : 2} className="px-4 py-10 text-center text-slate-400">Loading approvers...</td></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function ApproverEditor({ draft, setDraft, saving, save, cancel }: { draft: ApproverDraft; setDraft: (draft: ApproverDraft) => void; saving: boolean; save: () => Promise<void>; cancel: () => void }) {
  return (
    <tr className="border-b border-brand/30 bg-brand/5">
      <td className="px-4 py-3"><input autoFocus required value={draft.name} maxLength={200} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Approver name" aria-label="Approver name" className={inputClass} /></td>
      <td className="px-4 py-3"><input required type="email" value={draft.email} maxLength={320} onChange={(event) => setDraft({ ...draft, email: event.target.value })} placeholder="name@example.com" aria-label="Approver email" className={inputClass} /></td>
      <td className="px-4 py-2"><div className="flex justify-end gap-1"><button type="button" onClick={() => void save()} disabled={saving || !draft.name.trim() || !draft.email.trim()} className="rounded p-2 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40" title="Save approver"><Save size={16} /></button><button type="button" onClick={cancel} disabled={saving} className="rounded p-2 text-slate-500 hover:bg-slate-100" title="Cancel"><X size={16} /></button></div></td>
    </tr>
  );
}
