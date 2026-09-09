import { Card } from '@/components/ui/Card';
import { useOrg } from '@/state/OrgProvider';

export function DashboardPage() {
  const { selectedOrg } = useOrg();
  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
      <p className="mt-1 text-slate-500">
        {selectedOrg ? `Active organisation: ${selectedOrg.name}` : 'No organisation selected.'}
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <h2 className="font-medium text-slate-800">Modules</h2>
          <p className="mt-1 text-sm text-slate-500">Licensed products for this organisation.</p>
        </Card>
        <Card>
          <h2 className="font-medium text-slate-800">Team</h2>
          <p className="mt-1 text-sm text-slate-500">Members and their roles.</p>
        </Card>
        <Card>
          <h2 className="font-medium text-slate-800">Sessions</h2>
          <p className="mt-1 text-sm text-slate-500">Concurrent seat usage.</p>
        </Card>
      </div>
    </div>
  );
}
