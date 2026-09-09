import { Card } from '@/components/ui/Card';

export function OrgAdminPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-slate-900">Organisation Administrator</h1>
      <Card className="mt-6">
        <p className="text-slate-500">
          Manage members, assign module seats and configure organisation-level roles.
        </p>
      </Card>
    </div>
  );
}
