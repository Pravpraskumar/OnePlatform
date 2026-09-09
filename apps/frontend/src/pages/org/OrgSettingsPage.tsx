import { Card } from '@/components/ui/Card';
import { useOrg } from '@/state/OrgProvider';

export function OrgSettingsPage() {
  const { selectedOrg } = useOrg();
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Organisation Settings</h1>
      <Card className="mt-6">
        {selectedOrg ? (
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-500">Name</dt>
              <dd className="text-slate-800">{selectedOrg.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Slug</dt>
              <dd className="text-slate-800">{selectedOrg.slug}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Status</dt>
              <dd className="text-slate-800">{selectedOrg.status}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-slate-400">Select an organisation first.</p>
        )}
      </Card>
    </div>
  );
}
