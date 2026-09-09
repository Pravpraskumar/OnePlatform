import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Plus, Save, Trash2, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';

interface OrganisationTeam {
  id: string;
  name: string;
  description: string | null;
  memberIds: string[];
  updatedAt: string;
}

interface OrganisationMember {
  id: string;
  displayName: string;
  email: string;
  membership: 'Owner' | 'Admin' | 'Member';
}

interface OrganisationModule {
  productId: string;
  productCode: string;
  productName: string;
  teamId: string | null;
  teamName: string | null;
}

interface TeamsPayload {
  teams: OrganisationTeam[];
  members: OrganisationMember[];
  modules: OrganisationModule[];
}

export function OrgTeamsPage() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const [teams, setTeams] = useState<OrganisationTeam[]>([]);
  const [members, setMembers] = useState<OrganisationMember[]>([]);
  const [modules, setModules] = useState<OrganisationModule[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '' });
  const [memberIds, setMemberIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savingModuleId, setSavingModuleId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? null;

  const load = useCallback(async (preferredTeamId?: string) => {
    if (!selectedOrg) {
      setTeams([]);
      setMembers([]);
      setModules([]);
      return;
    }
    setError('');
    try {
      const payload = await api.get<TeamsPayload>(`/organisations/${selectedOrg.id}/teams`);
      setTeams(payload.teams);
      setMembers(payload.members);
      setModules(payload.modules);
      setSelectedTeamId((current) => {
        const candidate = preferredTeamId ?? current;
        return payload.teams.some((team) => team.id === candidate) ? candidate! : payload.teams[0]?.id ?? null;
      });
    } catch (requestError) {
      setError((requestError as Error).message);
    }
  }, [api, selectedOrg]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selectedTeam || creating) return;
    setDraft({ name: selectedTeam.name, description: selectedTeam.description ?? '' });
    setMemberIds(new Set(selectedTeam.memberIds));
  }, [creating, selectedTeam]);

  const startCreate = () => {
    setCreating(true);
    setSelectedTeamId(null);
    setDraft({ name: '', description: '' });
    setMemberIds(new Set());
    setError('');
  };

  const selectTeam = (team: OrganisationTeam) => {
    setCreating(false);
    setSelectedTeamId(team.id);
    setError('');
  };

  const toggleMember = (userId: string) => {
    setMemberIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const saveTeam = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedOrg) return;
    setSaving(true);
    setError('');
    try {
      let teamId = selectedTeam?.id;
      if (creating) {
        const created = await api.post<OrganisationTeam>(`/organisations/${selectedOrg.id}/teams`, draft);
        teamId = created.id;
      } else if (teamId) {
        await api.put(`/organisations/${selectedOrg.id}/teams/${teamId}`, draft);
      }
      if (teamId) {
        await api.put(`/organisations/${selectedOrg.id}/teams/${teamId}/members`, { userIds: [...memberIds] });
        setCreating(false);
        await load(teamId);
      }
    } catch (requestError) {
      setError((requestError as Error).message.includes('409') ? 'A team with this name already exists.' : (requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const deleteTeam = async () => {
    if (!selectedOrg || !selectedTeam || !window.confirm(`Delete team ${selectedTeam.name}? Modules assigned to it will become available to all organisation members.`)) return;
    setSaving(true);
    setError('');
    try {
      await api.del(`/organisations/${selectedOrg.id}/teams/${selectedTeam.id}`);
      setSelectedTeamId(null);
      await load();
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const assignModuleTeam = async (productId: string, teamId: string) => {
    if (!selectedOrg) return;
    setSavingModuleId(productId);
    setError('');
    try {
      await api.put(`/organisations/${selectedOrg.id}/modules/${productId}/team`, { teamId: teamId || null });
      await load(selectedTeamId ?? undefined);
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSavingModuleId(null);
    }
  };

  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Organisation Teams</h1>
        <p className="mt-1 text-slate-500">Control module access for teams within {selectedOrg?.name ?? 'the selected organisation'}.</p>
      </div>

      {!selectedOrg && <p className="mt-6 text-slate-500">Select an organisation first.</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {selectedOrg && (
        <div className="mt-6 grid min-h-[620px] overflow-hidden rounded-md border border-slate-200 bg-white lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="border-b border-slate-200 lg:border-b-0 lg:border-r">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <span className="font-semibold text-slate-900">Teams</span>
              <button type="button" onClick={startCreate} className="rounded-md p-2 text-slate-600 hover:bg-slate-100" aria-label="Create team" title="Create team"><Plus size={18} /></button>
            </div>
            <div className="p-2">
              {teams.map((team) => (
                <button key={team.id} type="button" onClick={() => selectTeam(team)} className={`mb-1 flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${selectedTeamId === team.id ? 'bg-brand/10 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}>
                  <UsersRound size={16} />
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{team.name}</span><span className="block text-xs text-slate-400">{team.memberIds.length} members</span></span>
                </button>
              ))}
              {teams.length === 0 && !creating && <p className="px-3 py-6 text-center text-sm text-slate-400">No teams created.</p>}
            </div>
          </aside>

          <section className="min-w-0">
            {(selectedTeam || creating) ? (
              <form onSubmit={saveTeam}>
                <div className="border-b border-slate-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div><h2 className="text-lg font-semibold text-slate-900">{creating ? 'Create team' : selectedTeam?.name}</h2><p className="mt-1 text-sm text-slate-500">Define the team and select its organisation members.</p></div>
                    <div className="flex gap-2">
                      {selectedTeam && <button type="button" onClick={deleteTeam} disabled={saving} className="rounded-md p-2 text-red-600 hover:bg-red-50" aria-label="Delete team" title="Delete team"><Trash2 size={18} /></button>}
                      <Button type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving...' : 'Save team'}</Button>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <label className="text-sm font-medium text-slate-700">Team name<input required minLength={2} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand" /></label>
                    <label className="text-sm font-medium text-slate-700">Description<input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-normal outline-none focus:border-brand" /></label>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="font-semibold text-slate-900">Team members</h3>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {members.map((member) => (
                      <label key={member.id} className="flex cursor-pointer items-center gap-3 rounded-md border border-slate-200 px-3 py-3 hover:bg-slate-50">
                        <input type="checkbox" checked={memberIds.has(member.id)} onChange={() => toggleMember(member.id)} className="h-4 w-4 accent-brand" />
                        <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{member.displayName}</span><span className="block truncate text-xs text-slate-500">{member.email} · {member.membership}</span></span>
                      </label>
                    ))}
                    {members.length === 0 && <p className="text-sm text-slate-400">No active organisation members are available.</p>}
                  </div>
                </div>
              </form>
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-slate-500">Select a team or create a new one.</div>
            )}

            <div className="border-t border-slate-200 p-5">
              <h3 className="font-semibold text-slate-900">Module access</h3>
              <p className="mt-1 text-sm text-slate-500">Assign one team to restrict a module, or leave it available to all active organisation members.</p>
              <Card className="mt-4 overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500"><th className="px-4 py-3">Module</th><th className="px-4 py-3">Access team</th></tr></thead>
                  <tbody>
                    {modules.map((module) => (
                      <tr key={module.productId} className="border-b border-slate-100">
                        <td className="px-4 py-3"><div className="font-medium text-slate-800">{module.productName}</div><div className="text-xs text-slate-500">{module.productCode}</div></td>
                        <td className="px-4 py-3">
                          <select value={module.teamId ?? ''} disabled={savingModuleId === module.productId} onChange={(event) => void assignModuleTeam(module.productId, event.target.value)} className="w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-2 outline-none focus:border-brand disabled:opacity-60">
                            <option value="">All organisation members</option>
                            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                    {modules.length === 0 && <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400">No modules are assigned to this organisation.</td></tr>}
                  </tbody>
                </table>
              </Card>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
