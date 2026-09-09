import { useCallback, useEffect, useState } from 'react';
import type { OrganisationModule } from '@platform/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { notify } from '@/lib/systemEvents';

interface ProjectOption {
  id: string;
  code: string;
  name: string;
}

interface Allocation {
  id: string;
  productId: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  allocatedSeats: number;
}

interface AllocationData {
  modules: OrganisationModule[];
  projects: ProjectOption[];
  allocations: Allocation[];
}

export function OrganisationProjectsPage() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const [data, setData] = useState<AllocationData>({ modules: [], projects: [], allocations: [] });
  const [productId, setProductId] = useState('');
  const [seatDrafts, setSeatDrafts] = useState<Record<string, number>>({});
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedOrg) return;
    try {
      const result = await api.get<AllocationData>(`/organisations/${selectedOrg.id}/project-modules`);
      setData(result);
      setProductId((current) => result.modules.some((module) => module.productId === current) ? current : result.modules[0]?.productId ?? '');
      setSeatDrafts(Object.fromEntries(result.allocations.map((allocation) => [allocation.projectId, allocation.allocatedSeats])));
    } catch {}
  }, [api, selectedOrg]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedModule = data.modules.find((module) => module.productId === productId);
  const moduleAllocations = data.allocations.filter((allocation) => allocation.productId === productId);
  const allocatedSeats = moduleAllocations.reduce((sum, allocation) => sum + allocation.allocatedSeats, 0);
  const remainingSeats = (selectedModule?.licensedSeats ?? 0) - allocatedSeats;

  const save = async (projectId: string) => {
    if (!selectedOrg || !productId) return;
    setSavingProjectId(projectId);
    try {
      await api.put(`/organisations/${selectedOrg.id}/project-modules`, {
        productId,
        projectId,
        allocatedSeats: Math.max(1, seatDrafts[projectId] ?? 1),
      });
      await load();
      notify('Project allocation saved.', 'success');
    } catch {
      // API errors are displayed by the global notification host.
    } finally {
      setSavingProjectId(null);
    }
  };

  const remove = async (projectId: string) => {
    if (!selectedOrg || !productId) return;
    setSavingProjectId(projectId);
    try {
      await api.del(`/organisations/${selectedOrg.id}/project-modules/${productId}/${projectId}`);
      await load();
      notify('Project allocation removed.', 'success');
    } catch {
      // API errors are displayed by the global notification host.
    } finally {
      setSavingProjectId(null);
    }
  };

  if (!selectedOrg) return <p className="text-slate-500">Select an organisation first.</p>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Organisation Projects</h1>
      <p className="mt-1 text-slate-500">Allocate {selectedOrg.name}&apos;s licensed module seats across projects.</p>

      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <label className="block w-full max-w-md text-sm text-slate-600">
          Organisation module
          <select className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" value={productId} onChange={(event) => setProductId(event.target.value)}>
            {data.modules.map((module) => <option key={module.productId} value={module.productId}>{module.productName}</option>)}
          </select>
        </label>
        {selectedModule && (
          <div className="flex gap-6 text-sm">
            <div><span className="block text-slate-500">Licensed</span><strong className="text-slate-900">{selectedModule.licensedSeats}</strong></div>
            <div><span className="block text-slate-500">Allocated</span><strong className="text-slate-900">{allocatedSeats}</strong></div>
            <div><span className="block text-slate-500">Remaining</span><strong className={remainingSeats ? 'text-green-700' : 'text-slate-900'}>{remainingSeats}</strong></div>
          </div>
        )}
      </div>

      <Card className="mt-5 overflow-x-auto p-0">
        <table className="w-full min-w-[650px] text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-500"><th className="px-4 py-3">Project</th><th className="w-40 px-4 py-3">Allocated seats</th><th className="w-32 px-4 py-3">Status</th><th className="w-40 px-4 py-3 text-right">Action</th></tr></thead>
          <tbody>
            {data.projects.map((project) => {
              const allocation = moduleAllocations.find((row) => row.projectId === project.id);
              return (
                <tr key={project.id} className="border-b border-slate-100">
                  <td className="px-4 py-3"><div className="font-medium text-slate-900">{project.name}</div><div className="text-xs text-slate-500">{project.code}</div></td>
                  <td className="px-4 py-3"><input type="number" min={1} max={(allocation?.allocatedSeats ?? 0) + remainingSeats} className="w-24 rounded-md border border-slate-300 px-3 py-2" value={seatDrafts[project.id] ?? 1} onChange={(event) => setSeatDrafts((current) => ({ ...current, [project.id]: Number(event.target.value) }))} aria-label={`${project.name} allocated seats`} /></td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${allocation ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>{allocation ? 'Allocated' : 'Not allocated'}</span></td>
                  <td className="px-4 py-3 text-right">{allocation ? <div className="flex justify-end gap-2"><Button variant="secondary" disabled={savingProjectId === project.id} onClick={() => save(project.id)}>Save</Button><Button variant="ghost" disabled={savingProjectId === project.id} onClick={() => remove(project.id)}>Remove</Button></div> : <Button disabled={savingProjectId === project.id || remainingSeats < 1} onClick={() => save(project.id)}>Allocate</Button>}</td>
                </tr>
              );
            })}
            {data.projects.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No active projects are available.</td></tr>}
          </tbody>
        </table>
      </Card>
      {data.modules.length === 0 && <p className="mt-4 text-sm text-amber-700">No modules are licensed to this organisation.</p>}
      {moduleAllocations.length === 0 && selectedModule && <p className="mt-4 text-sm text-slate-500">No project allocations: all {selectedModule.licensedSeats} seats are currently shared at organisation level.</p>}
    </div>
  );
}