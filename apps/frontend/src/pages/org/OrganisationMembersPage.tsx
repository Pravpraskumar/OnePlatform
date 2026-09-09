import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Ban, FolderCog, RotateCcw, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';

interface OrganisationMember {
  userId: string;
  email: string;
  displayName: string;
  membership: 'Owner' | 'Admin' | 'Member';
  status: 'active' | 'suspended' | 'pending';
  createdAt: string;
  updatedAt: string;
}

interface AvailableUser {
  id: string;
  email: string;
  displayName: string;
}

interface OrganisationProject {
  id: string;
  code: string;
  name: string;
}

interface MemberProjectAssignment {
  userId: string;
  projectId: string;
}

export function OrganisationMembersPage() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const [members, setMembers] = useState<OrganisationMember[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [projects, setProjects] = useState<OrganisationProject[]>([]);
  const [projectAssignments, setProjectAssignments] = useState<MemberProjectAssignment[]>([]);
  const [projectMember, setProjectMember] = useState<OrganisationMember | null>(null);
  const [draftProjectIds, setDraftProjectIds] = useState<Set<string>>(new Set());
  const [email, setEmail] = useState('');
  const [membership, setMembership] = useState<'Admin' | 'Member'>('Member');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!selectedOrg) return;
    setError('');
    Promise.all([
      api.get<OrganisationMember[]>(`/organisations/${selectedOrg.id}/team`),
      api.get<AvailableUser[]>(`/organisations/${selectedOrg.id}/available-users`),
      api.get<{ projects: OrganisationProject[]; assignments: MemberProjectAssignment[] }>(
        `/organisations/${selectedOrg.id}/member-projects`,
      ),
    ])
      .then(([team, users, projectData]) => {
        setMembers(team);
        setAvailableUsers(users);
        setProjects(projectData.projects);
        setProjectAssignments(projectData.assignments);
      })
      .catch((requestError) => setError((requestError as Error).message));
  }, [api, selectedOrg]);

  useEffect(() => load(), [load]);

  const addMember = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedOrg) return;
    setSaving(true);
    setError('');
    try {
      await api.post(`/organisations/${selectedOrg.id}/team`, { email, membership });
      setEmail('');
      load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removeMember = async (member: OrganisationMember) => {
    if (!selectedOrg || !window.confirm(`Remove ${member.displayName} from ${selectedOrg.name}?`)) return;
    setUpdatingUserId(member.userId);
    setError('');
    try {
      await api.del(`/organisations/${selectedOrg.id}/team/${member.userId}`);
      load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const updateMember = async (
    member: OrganisationMember,
    update: { membership?: 'Admin' | 'Member'; status?: 'active' | 'suspended' },
  ) => {
    if (!selectedOrg) return;
    setUpdatingUserId(member.userId);
    setError('');
    try {
      await api.patch(`/organisations/${selectedOrg.id}/team/${member.userId}`, update);
      load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  const manageProjects = (member: OrganisationMember) => {
    setProjectMember(member);
    setDraftProjectIds(
      new Set(
        projectAssignments
          .filter((assignment) => assignment.userId === member.userId)
          .map((assignment) => assignment.projectId),
      ),
    );
  };

  const toggleProject = (projectId: string) => {
    setDraftProjectIds((current) => {
      const next = new Set(current);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const saveProjects = async () => {
    if (!selectedOrg || !projectMember) return;
    setUpdatingUserId(projectMember.userId);
    setError('');
    try {
      await api.put(`/organisations/${selectedOrg.id}/team/${projectMember.userId}/projects`, {
        projectIds: [...draftProjectIds],
      });
      setProjectMember(null);
      load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  return (
    <div className="max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Organisation Members</h1>
        <p className="mt-1 text-slate-500">Users connected to {selectedOrg?.name ?? 'the selected organisation'}.</p>
      </div>

      {!selectedOrg && <p className="mt-6 text-slate-500">Select an organisation first.</p>}

      {selectedOrg && (
        <>
          <Card className="mt-6">
            <form className="flex flex-wrap items-end gap-3" onSubmit={addMember}>
              <label className="min-w-64 flex-1 text-sm font-medium text-slate-700">
                Global user
                <select
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand"
                >
                  <option value="">Select a user</option>
                  {availableUsers.map((user) => (
                    <option key={user.id} value={user.email}>
                      {user.displayName} ({user.email})
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Membership
                <select
                  value={membership}
                  onChange={(event) => setMembership(event.target.value as 'Admin' | 'Member')}
                  className="mt-1 block rounded-md border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand"
                >
                  <option value="Member">Member</option>
                  <option value="Admin">Admin</option>
                </select>
              </label>
              <Button type="submit" disabled={saving || !email}>
                <UserPlus size={16} />
                {saving ? 'Adding...' : 'Add member'}
              </Button>
            </form>
          </Card>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <Card className="mt-6 overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Membership</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Projects</th>
                  <th className="px-4 py-3">Last modified</th>
                  <th className="w-32 px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.userId} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{member.displayName}</div>
                      <div className="text-xs text-slate-500">{member.email}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {member.membership === 'Owner' ? (
                        <span>Owner</span>
                      ) : (
                        <select
                          value={member.membership}
                          disabled={updatingUserId === member.userId}
                          onChange={(event) => updateMember(member, { membership: event.target.value as 'Admin' | 'Member' })}
                          aria-label={`Membership for ${member.displayName}`}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand disabled:bg-slate-100"
                        >
                          <option value="Member">Member</option>
                          <option value="Admin">Admin</option>
                        </select>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${member.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {member.status === 'active' ? 'Active' : member.status === 'suspended' ? 'Deactivated' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => manageProjects(member)}
                        disabled={member.status !== 'active' || updatingUserId === member.userId}
                        className="inline-flex items-center gap-2 rounded-md px-2 py-1.5 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
                        title="Manage project access"
                      >
                        <FolderCog size={16} />
                        {projectAssignments.filter((assignment) => assignment.userId === member.userId).length}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(member.updatedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {member.membership !== 'Owner' && (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => updateMember(member, { status: member.status === 'active' ? 'suspended' : 'active' })}
                            disabled={updatingUserId === member.userId}
                            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"
                            aria-label={`${member.status === 'active' ? 'Deactivate' : 'Reactivate'} ${member.displayName}`}
                            title={member.status === 'active' ? 'Deactivate assignment' : 'Reactivate assignment'}
                          >
                            {member.status === 'active' ? <Ban size={16} /> : <RotateCcw size={16} />}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeMember(member)}
                            disabled={updatingUserId === member.userId}
                            className="rounded-md p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            aria-label={`Remove ${member.displayName}`}
                            title="Delete assignment"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-slate-400">No members found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </Card>

          {projectMember && (
            <section className="mt-6 border-t border-slate-200 pt-5" aria-labelledby="member-projects-heading">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id="member-projects-heading" className="font-semibold text-slate-900">
                    Projects for {projectMember.displayName}
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Only selected projects will appear in module Project fields.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" onClick={() => setProjectMember(null)}>
                    Cancel
                  </Button>
                  <Button type="button" disabled={updatingUserId === projectMember.userId} onClick={() => void saveProjects()}>
                    Save projects
                  </Button>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <label key={project.id} className="flex items-center gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={draftProjectIds.has(project.id)}
                      onChange={() => toggleProject(project.id)}
                      className="h-4 w-4 accent-brand"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-800">{project.name}</span>
                      <span className="block text-xs text-slate-500">{project.code}</span>
                    </span>
                  </label>
                ))}
                {projects.length === 0 && <p className="text-sm text-slate-500">No active organisation projects are available.</p>}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}