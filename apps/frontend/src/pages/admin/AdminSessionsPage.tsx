import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';

interface RunningSession {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  orgId: string;
  orgName: string;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
  startedAt: string;
  lastSeenAt: string;
  ip: string | null;
  userAgent: string | null;
}

function durationSince(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function AdminSessionsPage() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const [sessions, setSessions] = useState<RunningSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!selectedOrg) {
      setSessions([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const rows = await api.get<RunningSession[]>(
        `/sessions?orgId=${encodeURIComponent(selectedOrg.id)}`,
      );
      setSessions(rows);
    } catch (requestError) {
      setSessions([]);
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api, selectedOrg]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sessions</h1>
          <p className="mt-1 text-slate-500">
            Running module sessions for {selectedOrg?.name ?? 'the selected organisation'}.
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={loading || !selectedOrg}>
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Refresh
        </Button>
      </div>

      {!selectedOrg && <p className="mt-6 text-sm text-slate-500">Select an organisation first.</p>}
      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {selectedOrg && (
        <Card className="mt-6 overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Started</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Last heartbeat</th>
                <th className="px-4 py-3">Client</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-b border-slate-100 align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{session.userName}</div>
                    <div className="text-xs text-slate-500">{session.userEmail}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {session.productName ?? session.productCode ?? 'Administration'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(session.startedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{durationSince(session.startedAt)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(session.lastSeenAt).toLocaleString()}
                  </td>
                  <td className="max-w-64 px-4 py-3 text-xs text-slate-500">
                    <div>{session.ip ?? 'Unknown IP'}</div>
                    <div className="truncate" title={session.userAgent ?? undefined}>
                      {session.userAgent ?? 'Unknown client'}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && sessions.length === 0 && !error && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No running sessions.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}