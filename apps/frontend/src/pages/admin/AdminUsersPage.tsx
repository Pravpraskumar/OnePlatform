import { useCallback, useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useApi } from '@/lib/ApiProvider';

interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'suspended' | 'pending';
  hasPassword: boolean;
  isB2c: boolean;
  lastSignedInAt: string | null;
  createdAt: string;
  globalRoles: string[];
  roleAssignments: {
    name: string;
    scope: 'global' | 'org';
    productName: string | null;
    orgId: string | null;
    orgName: string | null;
  }[];
  organisations: { id: string; name: string; membership: string }[];
}

interface Role {
  id: string;
  name: string;
  scope: 'global' | 'org';
  productName: string | null;
}

interface ManagedOrganisation {
  id: string;
  name: string;
}

const statuses: ManagedUser['status'][] = ['active', 'suspended', 'pending'];

// Global Administrator: assign platform roles to users.
export function AdminUsersPage() {
  const api = useApi();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [organisations, setOrganisations] = useState<ManagedOrganisation[]>([]);
  const [organisationId, setOrganisationId] = useState('');
  const [error, setError] = useState('');
  const [editingRolesFor, setEditingRolesFor] = useState<string | null>(null);
  const [roleOrgId, setRoleOrgId] = useState('');
  const [updatingRole, setUpdatingRole] = useState(false);
  const editingUser = users.find((user) => user.id === editingRolesFor) ?? null;
  const filteredUsers = organisationId
    ? users.filter((user) => user.organisations.some((organisation) => organisation.id === organisationId))
    : users;

  const load = useCallback(() => {
    api.get<ManagedUser[]>('/users').then(setUsers).catch((e) => setError((e as Error).message));
    api.get<Role[]>('/users/roles').then(setRoles).catch(() => setRoles([]));
    api.get<ManagedOrganisation[]>('/organisations').then(setOrganisations).catch(() => setOrganisations([]));
  }, [api]);

  useEffect(() => load(), [load]);

  useEffect(() => {
    if (!editingUser) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setEditingRolesFor(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [editingUser]);

  const setStatus = async (id: string, status: ManagedUser['status']) => {
    await api.patch(`/users/${id}/status`, { status });
    load();
  };

  const openRoleEditor = (user: ManagedUser) => {
    setRoleOrgId(user.organisations[0]?.id ?? '');
    setEditingRolesFor(user.id);
  };

  const toggleRole = async (user: ManagedUser, role: Role) => {
    const orgId = role.scope === 'org' ? roleOrgId : undefined;
    const active = user.roleAssignments.some(
      (assignment) =>
        assignment.name === role.name &&
        (role.scope === 'global' ? !assignment.orgId : assignment.orgId === orgId),
    );
    setUpdatingRole(true);
    setError('');
    try {
      if (active) {
        const query = orgId ? `?orgId=${encodeURIComponent(orgId)}` : '';
        await api.del(`/users/${user.id}/roles/${encodeURIComponent(role.name)}${query}`);
      } else {
        await api.post(`/users/${user.id}/roles`, { roleName: role.name, orgId });
      }
      load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setUpdatingRole(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">User Assignments</h1>
          <p className="mt-1 text-slate-500">Assign global and module roles to platform users.</p>
        </div>
        <Button variant="secondary" onClick={load}>Refresh</Button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <label className="mt-6 block w-full max-w-sm text-sm font-medium text-slate-700">
        Organisation
        <select
          value={organisationId}
          onChange={(event) => setOrganisationId(event.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-normal outline-none focus:border-brand"
        >
          <option value="">All organisations</option>
          {organisations.map((organisation) => (
            <option key={organisation.id} value={organisation.id}>
              {organisation.name}
            </option>
          ))}
        </select>
      </label>

      <Card className="mt-6 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Roles</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 align-top">
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-800">{u.displayName}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <select
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                    value={u.status}
                    onChange={(e) => setStatus(u.id, e.target.value as ManagedUser['status'])}
                  >
                    {statuses.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex min-w-48 items-start gap-2">
                    <div className="flex flex-1 flex-wrap gap-1">
                      {u.roleAssignments.map((assignment) => (
                        <span
                          key={`${assignment.name}-${assignment.orgId ?? 'global'}`}
                          className="rounded-full border border-brand bg-brand/10 px-2 py-0.5 text-xs text-slate-800"
                        >
                          {assignment.name}
                          {assignment.productName ? ` · ${assignment.productName}` : ''}
                          {assignment.orgName ? ` · ${assignment.orgName}` : ''}
                        </span>
                      ))}
                      {u.roleAssignments.length === 0 && (
                        <span className="text-xs text-slate-400">No roles assigned</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => openRoleEditor(u)}
                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                      aria-label={`Edit ${u.displayName} roles`}
                      title="Edit roles"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredUsers.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-slate-400">
                  {organisationId ? 'No users are assigned to this organisation.' : 'No users found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditingRolesFor(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-user-roles-title"
            className="w-full max-w-lg rounded-md bg-white shadow-xl"
          >
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 id="edit-user-roles-title" className="text-lg font-semibold text-slate-900">
                  Edit roles
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {editingUser.displayName} ({editingUser.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRolesFor(null)}
                className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close role editor"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto p-5">
              {roles.some((role) => role.scope === 'org') && (
                <label className="mb-4 block text-sm font-medium text-slate-700">
                  Organisation for organisation roles
                  <select
                    value={roleOrgId}
                    onChange={(event) => setRoleOrgId(event.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand"
                  >
                    <option value="">Select an organisation</option>
                    {editingUser.organisations.map((organisation) => (
                      <option key={organisation.id} value={organisation.id}>
                        {organisation.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div className="space-y-2">
                {roles.map((role) => {
                  const active = editingUser.roleAssignments.some(
                    (assignment) =>
                      assignment.name === role.name &&
                      (role.scope === 'global'
                        ? !assignment.orgId
                        : assignment.orgId === roleOrgId),
                  );
                  return (
                    <label
                      key={role.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 px-4 py-3 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        disabled={updatingRole || (role.scope === 'org' && !roleOrgId)}
                        onChange={() => toggleRole(editingUser, role)}
                        className="h-4 w-4 accent-brand"
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{role.name}</span>
                      <span className="text-xs text-slate-400">
                        {role.productName ?? (role.scope === 'org' ? 'Organisation' : 'Global')}
                      </span>
                    </label>
                  );
                })}
                {roles.length === 0 && <p className="text-sm text-slate-500">No global roles available.</p>}
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-200 px-5 py-4">
              <Button type="button" variant="secondary" onClick={() => setEditingRolesFor(null)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
