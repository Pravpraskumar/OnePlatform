import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';

type ProjectStatus = 'planned' | 'active' | 'on_hold' | 'completed' | 'cancelled';

interface ProjectManager {
  id: string;
  displayName: string;
  email: string;
}

interface ManagedProject {
  id: string;
  code: string;
  name: string;
  description: string;
  status: ProjectStatus;
  managerUserId: string;
  managerName: string;
  managerEmail: string;
  createdAt: string;
}

interface ProjectDraft {
  code: string;
  name: string;
  description: string;
  status: ProjectStatus;
  managerUserId: string;
}

const statuses: { value: ProjectStatus; label: string }[] = [
  { value: 'planned', label: 'Planned' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const emptyDraft: ProjectDraft = {
  code: '',
  name: '',
  description: '',
  status: 'planned',
  managerUserId: '',
};

const field = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm';

export function AdminProjectsPage() {
  const api = useApi();
  const [projects, setProjects] = useState<ManagedProject[]>([]);
  const [managers, setManagers] = useState<ProjectManager[]>([]);
  const [draft, setDraft] = useState<ProjectDraft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [projectRows, managerRows] = await Promise.all([
        api.get<ManagedProject[]>('/projects'),
        api.get<ProjectManager[]>('/projects/managers'),
      ]);
      setProjects(projectRows);
      setManagers(managerRows);
    } catch (loadError) {
      setError((loadError as Error).message);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setDraft(emptyDraft);
    setEditingId(null);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (editingId) await api.put(`/projects/${editingId}`, draft);
      else await api.post('/projects', draft);
      resetForm();
      await load();
    } catch (saveError) {
      setError((saveError as Error).message.includes('409') ? 'That project code is already in use.' : 'Project could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (project: ManagedProject) => {
    setEditingId(project.id);
    setDraft({
      code: project.code,
      name: project.name,
      description: project.description,
      status: project.status,
      managerUserId: project.managerUserId,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
      <p className="mt-1 text-slate-500">Create and manage projects for the Global Organisation.</p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <Card className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-medium text-slate-800">{editingId ? 'Edit project' : 'Create project'}</h2>
          {editingId && <Button variant="ghost" onClick={resetForm}>Cancel</Button>}
        </div>
        <form onSubmit={save} className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="block text-sm text-slate-600">
            Project code
            <input required maxLength={50} className={field} value={draft.code} onChange={(event) => setDraft((current) => ({ ...current, code: event.target.value.toUpperCase() }))} />
          </label>
          <label className="block text-sm text-slate-600">
            Project name
            <input required maxLength={200} className={field} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label className="block text-sm text-slate-600 lg:col-span-2">
            Project description
            <textarea required rows={3} className={field} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} />
          </label>
          <label className="block text-sm text-slate-600">
            Project status
            <select required className={field} value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as ProjectStatus }))}>
              {statuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
            </select>
          </label>
          <label className="block text-sm text-slate-600">
            Project manager
            <select required className={field} value={draft.managerUserId} onChange={(event) => setDraft((current) => ({ ...current, managerUserId: event.target.value }))}>
              <option value="" disabled>Select a manager</option>
              {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.displayName} ({manager.email})</option>)}
            </select>
          </label>
          <div className="lg:col-span-2">
            <Button type="submit" disabled={saving || managers.length === 0}>{saving ? 'Saving...' : editingId ? 'Save changes' : 'Create project'}</Button>
            {managers.length === 0 && <span className="ml-3 text-sm text-amber-700">An active user is required as project manager.</span>}
          </div>
        </form>
      </Card>

      <Card className="mt-6 overflow-x-auto p-0">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="px-4 py-3">Project</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3">Created on</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Project manager</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((project) => (
              <tr key={project.id} className="border-b border-slate-100 align-top">
                <td className="px-4 py-3"><div className="font-medium text-slate-800">{project.name}</div><div className="text-xs text-slate-500">{project.code}</div></td>
                <td className="max-w-sm px-4 py-3 text-slate-600">{project.description}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(project.createdAt))}</td>
                <td className="px-4 py-3"><span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{statuses.find((status) => status.value === project.status)?.label}</span></td>
                <td className="px-4 py-3"><div className="text-slate-800">{project.managerName}</div><div className="text-xs text-slate-500">{project.managerEmail}</div></td>
                <td className="px-4 py-3 text-right"><Button variant="ghost" onClick={() => edit(project)}>Edit</Button></td>
              </tr>
            ))}
            {projects.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No projects yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}