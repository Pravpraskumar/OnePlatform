import { useEffect, useRef, useState } from 'react';
import { Activity, RefreshCw, Ship } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { SalesforceSyncRun, SpinergieSyncLog } from '@platform/shared';
import { Button } from '@/components/ui/Button';
import { useApi } from '@/lib/ApiProvider';

const dateTime = (value: string | null) => value ? new Date(value).toLocaleString() : '—';
const duration = (run: SalesforceSyncRun) => `${Math.max(0, Math.round((Date.parse(run.completedAt) - Date.parse(run.startedAt)) / 1000))}s`;

export function CaptureProSpinergieSyncPanel({ orgId, canSync, configured, refreshVersion, dataset = 'vessels' }: { orgId: string; canSync: boolean; configured: boolean | null; refreshVersion: number; dataset?: 'vessels' | 'charters' }) {
  const api = useApi();
  const title = dataset === 'charters' ? 'Vessel Charters' : 'Vessel Specifications';
  const providerLabel = dataset === 'charters' ? 'Spinergie charter' : 'Spinergie';
  const headingId = `spinergie-${dataset}-sync-heading`;
  const active = useRef(true);
  const [log, setLog] = useState<SpinergieSyncLog | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setLoadError('');
    api.capturePro<SpinergieSyncLog>(`/spinergie-${dataset}/sync-runs?orgId=${encodeURIComponent(orgId)}`)
      .then((result) => {
        if (!result?.health || !Array.isArray(result.runs)) throw new Error('Capture-Pro returned an unexpected Spinergie sync log.');
        if (!cancelled) setLog(result);
      }).catch((reason: unknown) => { if (!cancelled) setLoadError(reason instanceof Error ? reason.message : 'Spinergie health could not be loaded.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, orgId, dataset, attempt, refreshVersion]);
  async function sync() {
    setSyncing(true); setActionError(''); setMessage('');
    try {
      const result = await api.capturePro<SalesforceSyncRun>(`/spinergie-${dataset}/sync`, { method: 'POST', body: JSON.stringify({ orgId }) });
      if (!result || result.status !== 'Succeeded') throw new Error('Capture-Pro returned an unexpected Spinergie sync result.');
      if (active.current) setMessage(`${providerLabel} sync completed: ${result.matchedCount} ${dataset} (${result.insertedCount} new, ${result.updatedCount} updated, ${result.removedCount} no longer in the extract).`);
    } catch (reason: unknown) {
      if (active.current) setActionError(reason instanceof Error ? reason.message : `${providerLabel} sync failed.`);
    } finally {
      if (active.current) { setSyncing(false); setAttempt((value) => value + 1); }
    }
  }
  const health = log?.health;
  const healthStyle = health?.status === 'Healthy' ? 'text-emerald-700' : health?.status === 'Failing' ? 'text-red-700' : 'text-slate-600';
  return (
    <section aria-labelledby={headingId} className="border-t border-slate-200 pt-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="flex items-center gap-1.5 text-xs font-semibold text-teal-700"><Ship size={15} />Spinergie</p><h2 id={headingId} className="mt-1 text-lg font-semibold">{title}</h2><Link to={`/app/product/Capture-Pro/spinergie-${dataset}`} className="mt-1 inline-block text-sm text-teal-700 underline">View {title.toLowerCase()}</Link></div>
        <div className="flex items-center gap-2"><Button variant="ghost" disabled={loading || syncing} aria-label={`Refresh ${providerLabel} sync health`} title={`Refresh ${providerLabel} health`} onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={16} className={loading ? 'animate-spin' : undefined} /></Button>{canSync && <Button disabled={syncing || configured !== true || !!loadError} onClick={() => void sync()}><RefreshCw size={16} className={syncing ? 'animate-spin' : undefined} />{syncing ? 'Synchronizing...' : `Sync Spinergie ${dataset} now`}</Button>}</div>
      </header>
      {canSync && configured === false && <p className="mt-3 text-sm text-amber-800">Save a Spinergie API key in <Link to="/app/product/Capture-Pro/integrations" className="underline">Integrations</Link> before synchronizing.</p>}
      {canSync && configured === null && <p role="status" className="mt-3 text-sm text-amber-800">Spinergie configuration could not yet be verified. Check Integrations or reload this page before synchronizing.</p>}
      {!canSync && <p className="mt-3 text-xs text-slate-500">Only integration administrators can run a sync.</p>}
      {loading && <p role="status" className="mt-4 text-sm text-slate-500">Loading Spinergie health...</p>}
      {loadError && <p role="alert" className="mt-3 text-sm text-red-700">{loadError}</p>}
      {actionError && <p role="alert" className="mt-3 text-sm text-red-700">{actionError}</p>}
      {message && <p role="status" className="mt-3 text-sm text-teal-800">{message}</p>}
      {log && <>
        <div className="my-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4"><h3 className="flex items-center gap-2 text-sm font-semibold"><Activity size={16} />Recorded sync health</h3><p className={`mt-2 text-xl font-semibold ${healthStyle}`}>{log.health.status}</p><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><dt>Last successful sync</dt><dd>{dateTime(log.health.lastSuccessfulAt)}</dd><dt>Last failed sync</dt><dd>{dateTime(log.health.lastFailedAt)}</dd><dt>Consecutive failures</dt><dd>{log.health.consecutiveFailures}</dd><dt>Recent success rate</dt><dd>{log.health.recentRunCount ? `${log.health.recentSuccessCount} of ${log.health.recentRunCount} runs` : '—'}</dd></dl></div>
          <div className="rounded-lg border border-slate-200 p-4"><h3 className="text-sm font-semibold">Last run</h3>{log.lastRun ? <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm"><dt>Status</dt><dd>{log.lastRun.status}</dd><dt>Started</dt><dd>{dateTime(log.lastRun.startedAt)}</dd><dt>Completed</dt><dd>{dateTime(log.lastRun.completedAt)} ({duration(log.lastRun)})</dd><dt>Received / stored</dt><dd>{log.lastRun.receivedCount} / {log.lastRun.matchedCount}</dd><dt>Changes</dt><dd>{log.lastRun.insertedCount} new, {log.lastRun.updatedCount} updated, {log.lastRun.removedCount} removed</dd>{log.lastRun.errorMessage && <><dt>Reason</dt><dd className="break-words text-red-700">{log.lastRun.errorMessage}</dd></>}</dl> : <p className="mt-3 text-sm text-slate-500">No Spinergie sync has run yet.</p>}</div>
        </div>
        <h3 className="mb-2 text-sm font-semibold">{providerLabel} run log (latest {log.runs.length})</h3>
        {log.runs.length === 0 ? <p className="text-sm text-slate-500">No {providerLabel} runs have been recorded.</p> : <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="min-w-full text-sm" aria-label={`${providerLabel} sync run log`}><thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>{['Started', 'Duration', 'Status', 'Received', 'Stored', 'New', 'Updated', 'Removed', 'Started by', 'Reason'].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-3 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{log.runs.map((run) => <tr key={run.id}><td className="whitespace-nowrap px-3 py-3">{dateTime(run.startedAt)}</td><td className="px-3 py-3">{duration(run)}</td><td className="px-3 py-3">{run.status}</td>{[run.receivedCount, run.matchedCount, run.insertedCount, run.updatedCount, run.removedCount].map((count, index) => <td key={index} className="px-3 py-3 tabular-nums">{count}</td>)}<td className="whitespace-nowrap px-3 py-3">{run.startedByCurrentUser ? 'You' : 'Another administrator'}</td><td className="min-w-60 px-3 py-3 text-red-700">{run.errorMessage ?? ''}</td></tr>)}</tbody></table></div>}
      </>}
    </section>
  );
}