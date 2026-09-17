import { useCallback, useEffect, useState } from 'react';
import { MailCheck, RefreshCw, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { notify } from '@/lib/systemEvents';

interface EmailDeliveryLog {
  id: string;
  module: string;
  eventType: string;
  referenceId: string;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  status: string;
  smtpConfigurationName: string | null;
  providerMessageId: string | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
}

const selectClass = 'rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-brand';

export function AdminEmailLogsPage() {
  const api = useApi();
  const [logs, setLogs] = useState<EmailDeliveryLog[]>([]);
  const [module, setModule] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (module) params.set('module', module);
      if (status) params.set('status', status);
      const query = params.size > 0 ? `?${params.toString()}` : '';
      setLogs(await api.get<EmailDeliveryLog[]>(`/notifications/email-logs${query}`));
    } catch (requestError) {
      setLogs([]);
      setError((requestError as Error).message);
    } finally {
      setLoading(false);
    }
  }, [api, module, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = async (log: EmailDeliveryLog) => {
    setRetryingId(log.id);
    try {
      const result = await api.post<{ status: 'sent' | 'failed'; message?: string }>(`/notifications/email-logs/${log.id}/retry`, {});
      if (result.status === 'sent') notify(`Email resent to ${log.recipientEmail}.`, 'success');
      else notify(result.message ?? 'Email retry failed.', 'warning');
      await load();
    } catch {
      // API errors are displayed by the global notification host.
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900"><MailCheck size={24} />Email Delivery Logs</h1>
          <p className="mt-1 text-sm text-slate-500">Review outbound email attempts from platform modules and their delivery status.</p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />Refresh</Button>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <label className="text-sm font-medium text-slate-700">Module<select value={module} onChange={(event) => setModule(event.target.value)} className={`ml-2 ${selectClass}`}><option value="">All modules</option><option value="CreditGuard">CreditGuard</option></select></label>
        <label className="text-sm font-medium text-slate-700">Status<select value={status} onChange={(event) => setStatus(event.target.value)} className={`ml-2 ${selectClass}`}><option value="">All statuses</option><option value="Sent">Sent</option><option value="Failed">Failed</option></select></label>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      <Card className="mt-4 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600"><th className="px-4 py-3">Created</th><th className="px-4 py-3">Module / Event</th><th className="px-4 py-3">Reference</th><th className="px-4 py-3">Recipient</th><th className="px-4 py-3">Subject</th><th className="px-4 py-3">SMTP</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead>
          <tbody>
            {logs.map((log) => <tr key={log.id} className="border-b border-slate-100 align-top"><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{new Date(log.createdAt).toLocaleString()}</td><td className="px-4 py-3"><div className="font-medium text-slate-800">{log.module}</div><div className="text-xs text-slate-500">{log.eventType}</div></td><td className="px-4 py-3 font-mono text-xs text-slate-600">{log.referenceId}</td><td className="px-4 py-3"><div className="font-medium text-slate-800">{log.recipientName}</div><div className="text-xs text-slate-500">{log.recipientEmail}</div></td><td className="max-w-72 px-4 py-3 text-slate-700">{log.subject}</td><td className="px-4 py-3 text-slate-600">{log.smtpConfigurationName ?? 'Not selected'}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${log.status === 'Sent' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{log.status}</span>{log.errorMessage && <details className="mt-2 max-w-80 text-xs text-red-700"><summary className="cursor-pointer font-medium">Error details</summary><pre className="mt-2 whitespace-pre-wrap break-words rounded-md border border-red-100 bg-red-50 p-2 font-mono text-[11px] leading-5 text-red-800">{log.errorMessage}</pre></details>}{log.providerMessageId && <div className="mt-2 max-w-72 truncate text-xs text-slate-400" title={log.providerMessageId}>{log.providerMessageId}</div>}</td><td className="px-4 py-3 text-right">{log.status === 'Failed' && <Button variant="secondary" className="px-3 py-1.5" onClick={() => void retry(log)} disabled={retryingId !== null} aria-label={`Retry email to ${log.recipientEmail}`} title="Retry email"><RotateCw size={15} className={retryingId === log.id ? 'animate-spin' : ''} />Retry</Button>}</td></tr>)}
            {!loading && logs.length === 0 && !error && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">No email delivery attempts match the selected filters.</td></tr>}
            {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Loading email delivery logs...</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
