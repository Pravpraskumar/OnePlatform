import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Search, Settings, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';

type UserStatus = 'active' | 'suspended' | 'pending';

interface GlobalUser {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  username: string;
  status: UserStatus;
  hasPassword: boolean;
  isB2c: boolean;
  lastSignedInAt: string | null;
  createdAt: string;
  updatedAt: string;
  roleAssignments: { name: string; productName: string | null }[];
  organisations: { id: string; name: string; membership: string }[];
}

interface UserDraft {
  firstName: string;
  lastName: string;
  email: string;
  username: string;
  status: UserStatus;
}

interface ManagedOrganisation {
  id: string;
  name: string;
}

const statuses: { value: UserStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'pending', label: 'Pending' },
];

const field = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10';

function errorMessage(error: unknown, fallback: string) {
  const message = (error as Error).message;
  const match = message.match(/"message":"([^"]+)"/);
  return match?.[1] ?? fallback;
}

export function GlobalUsersPage() {
  const api = useApi();
  const [users, setUsers] = useState<GlobalUser[]>([]);
  const [organisations, setOrganisations] = useState<ManagedOrganisation[]>([]);
  const [organisationId, setOrganisationId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [bulkStatus, setBulkStatus] = useState<UserStatus>('active');
  const [editing, setEditing] = useState<GlobalUser | null>(null);
  const [draft, setDraft] = useState<UserDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [userRows, organisationRows] = await Promise.all([
        api.get<GlobalUser[]>('/users'),
        api.get<ManagedOrganisation[]>('/organisations'),
      ]);
      setUsers(userRows);
      setOrganisations(organisationRows);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Users could not be loaded.'));
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredUsers = useMemo(() => {
    const term = query.trim().toLowerCase();
    return users.filter((user) => {
      const matchesOrganisation = !organisationId || user.organisations.some((organisation) => organisation.id === organisationId);
      const matchesSearch = !term || [user.firstName, user.lastName, user.displayName, user.email, user.username, user.status]
        .some((value) => value.toLowerCase().includes(term));
      return matchesOrganisation && matchesSearch;
    });
  }, [organisationId, query, users]);

  const visibleSelected = filteredUsers.length > 0 && filteredUsers.every((user) => selectedIds.has(user.id));

  const toggleAll = () => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (visibleSelected) filteredUsers.forEach((user) => next.delete(user.id));
      else filteredUsers.forEach((user) => next.add(user.id));
      return next;
    });
  };

  const toggleUser = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const applyBulkStatus = async () => {
    if (selectedIds.size === 0) return;
    setBusy(true);
    setError('');
    try {
      await api.patch('/users/bulk/status', { userIds: [...selectedIds], status: bulkStatus });
      setSelectedIds(new Set());
      await load();
    } catch (bulkError) {
      setError(errorMessage(bulkError, 'Selected users could not be updated.'));
    } finally {
      setBusy(false);
    }
  };

  const openEditor = (user: GlobalUser) => {
    setEditing(user);
    setDraft({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      status: user.status,
    });
  };

  const saveUser = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing || !draft) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/users/${editing.id}`, draft);
      setEditing(null);
      setDraft(null);
      await load();
    } catch (saveError) {
      setError(errorMessage(saveError, 'User could not be updated.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Global Users</h1>
          <p className="mt-1 text-slate-500">Manage user identity, account status, and platform details.</p>
        </div>
        <label className="relative block w-full lg:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm" placeholder="Search users" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <div className="mt-6 flex min-h-10 flex-wrap items-center gap-3">
        <span className="text-sm text-slate-600">{selectedIds.size} selected</span>
        <select className="rounded-md border border-slate-300 px-3 py-2 text-sm" value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as UserStatus)}>
          {statuses.map((status) => <option key={status.value} value={status.value}>Set {status.label.toLowerCase()}</option>)}
        </select>
        <Button disabled={busy || selectedIds.size === 0} onClick={applyBulkStatus}>Apply to selected</Button>
        <Button variant="secondary" onClick={load}>Refresh</Button>
        <label className="flex w-full items-center gap-2 text-sm font-medium text-slate-700 sm:ml-auto sm:w-auto">
          Organisation
          <select
            value={organisationId}
            onChange={(event) => {
              setOrganisationId(event.target.value);
              setSelectedIds(new Set());
            }}
            className="min-w-56 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 font-normal outline-none focus:border-brand sm:flex-none"
          >
            <option value="">All organisations</option>
            {organisations.map((organisation) => (
              <option key={organisation.id} value={organisation.id}>
                {organisation.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <Card className="mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <th className="w-12 px-4 py-3"><input type="checkbox" checked={visibleSelected} onChange={toggleAll} aria-label="Select visible users" className="h-4 w-4 accent-brand" /></th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Username</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Roles</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Last signed in</th>
              <th className="w-16 px-4 py-3 text-right">Edit</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className="border-b border-slate-100 align-top hover:bg-slate-50/70">
                <td className="px-4 py-3"><input type="checkbox" checked={selectedIds.has(user.id)} onChange={() => toggleUser(user.id)} aria-label={`Select ${user.displayName}`} className="h-4 w-4 accent-brand" /></td>
                <td className="px-4 py-3"><div className="font-medium text-slate-900">{user.firstName} {user.lastName}</div><div className="text-xs text-slate-500">{user.email}</div></td>
                <td className="px-4 py-3 text-slate-600">{user.username}</td>
                <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${user.status === 'active' ? 'bg-green-100 text-green-700' : user.status === 'suspended' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{user.status}</span></td>
                <td className="max-w-56 px-4 py-3 text-slate-600">{user.roleAssignments.map((role) => `${role.name}${role.productName ? ` (${role.productName})` : ''}`).join(', ') || 'None'}</td>
                <td className="px-4 py-3 text-slate-600">{user.isB2c ? 'Microsoft' : user.hasPassword ? 'Local' : 'No login'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{user.lastSignedInAt ? new Date(user.lastSignedInAt).toLocaleString() : 'Never'}</td>
                <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1"><Link to={`/admin/user-settings?userId=${encodeURIComponent(user.id)}`} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label={`Open ${user.displayName} settings`} title="User settings"><Settings size={16} /></Link><button type="button" onClick={() => openEditor(user)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label={`Edit ${user.displayName}`} title="Edit user"><Pencil size={16} /></button></div></td>
              </tr>
            ))}
            {filteredUsers.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">{organisationId ? 'No users in this organisation match the current search.' : 'No users match the current search.'}</td></tr>}
          </tbody>
        </table>
      </Card>

      {editing && draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
          <form onSubmit={saveUser} className="w-full max-w-2xl rounded-md bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="edit-global-user-title">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4"><div><h2 id="edit-global-user-title" className="text-lg font-semibold text-slate-900">Edit global user</h2><p className="mt-1 text-sm text-slate-500">Update account identity and status.</p></div><button type="button" onClick={() => setEditing(null)} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
            <div className="grid gap-4 p-6 sm:grid-cols-2">
              <label className="text-sm text-slate-600">First name<input required className={field} value={draft.firstName} onChange={(event) => setDraft((current) => current && ({ ...current, firstName: event.target.value }))} /></label>
              <label className="text-sm text-slate-600">Last name<input required className={field} value={draft.lastName} onChange={(event) => setDraft((current) => current && ({ ...current, lastName: event.target.value }))} /></label>
              <label className="text-sm text-slate-600 sm:col-span-2">Email<input required type="email" className={field} value={draft.email} onChange={(event) => setDraft((current) => current && ({ ...current, email: event.target.value }))} /></label>
              <label className="text-sm text-slate-600">Username<input required minLength={3} className={field} value={draft.username} onChange={(event) => setDraft((current) => current && ({ ...current, username: event.target.value }))} /></label>
              <label className="text-sm text-slate-600">Status<select className={field} value={draft.status} onChange={(event) => setDraft((current) => current && ({ ...current, status: event.target.value as UserStatus }))}>{statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4"><Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" disabled={busy}>Save user</Button></div>
          </form>
        </div>
      )}
    </div>
  );
}