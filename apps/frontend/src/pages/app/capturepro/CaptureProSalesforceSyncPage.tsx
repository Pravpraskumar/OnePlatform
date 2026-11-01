import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertTriangle, CheckCircle2, CircleDashed, RefreshCw } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import type { CaptureProIntegrations, MenuNode, SalesforceSyncHealth, SalesforceSyncLog, SalesforceSyncLogEntry, SalesforceSyncRun } from '@platform/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SalesforceSourceBadge } from './salesforceTable';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { CaptureProSpinergieSyncPanel } from './CaptureProSpinergieSyncPanel';

const syncRoute = '/app/product/Capture-Pro/salesforce-sync';

function findMenu(nodes: MenuNode[]): MenuNode | undefined {
  for (const node of nodes) {
    if (node.route === syncRoute) return node;
    const child = findMenu(node.children);
    if (child) return child;
  }
  return undefined;
}

const dateTime = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');
function duration(startedAt: string, completedAt: string) {
  const seconds = Math.max(0, Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
function age(value: string | null) {
  if (!value) return '';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

const healthStyles = {
  Healthy: { icon: CheckCircle2, className: 'border-emerald-200 bg-emerald-50 text-emerald-800', description: 'The latest sync completed successfully.' },
  Failing: { icon: AlertTriangle, className: 'border-red-200 bg-red-50 text-red-800', description: 'The latest sync failed. Review the reason below.' },
  'Not synchronized': { icon: CircleDashed, className: 'border-slate-200 bg-slate-50 text-slate-700', description: 'No sync has run for this organisation.' },
} as const;

const objects = {
  opportunities: {
    title: 'Opportunities', objectName: 'Opportunity', endpoint: '/salesforce-opportunities/sync', button: 'Sync opportunities now',
    description: 'Imports Salesforce opportunities using the Capture-Pro market-analyst query. Capture-Pro opportunities are not created or changed.',
    message: (run: SalesforceSyncRun) => `Salesforce sync completed: ${run.matchedCount} matching opportunities (${run.insertedCount} new, ${run.updatedCount} updated, ${run.removedCount} no longer in the extract).`,
  },
  accounts: {
    title: 'Accounts', objectName: 'Account', endpoint: '/salesforce-accounts/sync', button: 'Sync accounts now',
    description: 'Imports all Salesforce Accounts (Id, Name, Type, Company Short Name), up to 50,000.',
    message: (run: SalesforceSyncRun) => `Salesforce account sync completed: ${run.matchedCount} accounts (${run.insertedCount} new, ${run.updatedCount} updated, ${run.removedCount} no longer in Salesforce).`,
  },
  competitors: {
    title: 'Competitors', objectName: 'Project_Competitor_Details__c', endpoint: '/salesforce-competitors/sync', button: 'Sync competitors now',
    description: 'Imports all Salesforce Project Competitor Details, up to 50,000, keeping Salesforce field types.',
    message: (run: SalesforceSyncRun) => `Salesforce competitor sync completed: ${run.matchedCount} competitor records (${run.insertedCount} new, ${run.updatedCount} updated, ${run.removedCount} no longer in Salesforce).`,
  },
  fabricationYards: {
    title: 'Fabrication Yard', objectName: 'Fabrication_Yard__c', endpoint: '/salesforce-fabrication-yards/sync', button: 'Sync fabrication yards now',
    description: 'Describes the Salesforce Fabrication Yard object and imports every queryable field for all records, up to 50,000.',
    message: (run: SalesforceSyncRun) => `Salesforce fabrication yard sync completed: ${run.matchedCount} fabrication yards (${run.insertedCount} new, ${run.updatedCount} updated, ${run.removedCount} no longer in Salesforce).`,
  },
  vessels: {
    title: 'Vessel Data', objectName: 'Vessel__c', endpoint: '/salesforce-vessels/sync', button: 'Sync vessels now',
    description: 'Describes the Salesforce Vessel object and imports every queryable field for all records, up to 50,000.',
    message: (run: SalesforceSyncRun) => `Salesforce vessel sync completed: ${run.matchedCount} vessels (${run.insertedCount} new, ${run.updatedCount} updated, ${run.removedCount} no longer in Salesforce).`,
  },
  bidBudgets: {
    title: 'Bid Budget Data', objectName: 'Opportunity_Bid_Budget__c', endpoint: '/salesforce-bid-budgets/sync', button: 'Sync bid budgets now',
    description: 'Imports all Salesforce Opportunity Bid Budget records, up to 50,000, keeping Salesforce field types.',
    message: (run: SalesforceSyncRun) => `Salesforce bid budget sync completed: ${run.matchedCount} bid budget records (${run.insertedCount} new, ${run.updatedCount} updated, ${run.removedCount} no longer in Salesforce).`,
  },
} as const;
type ObjectKey = keyof typeof objects;

export function CaptureProSalesforceSyncPage() {
  const { selectedOrg } = useOrg();
  const { productId } = useOutletContext<{ productId: string }>();
  if (!selectedOrg) return <p role="alert">Select an organisation to view Salesforce sync health.</p>;
  return <SalesforceSyncHealthView key={`${selectedOrg.id}:${productId}`} orgId={selectedOrg.id} productId={productId} />;
}

function ObjectSyncPanel({ objectKey, health, latest, canSync, configured, onSynced }: {
  objectKey: ObjectKey;
  health: SalesforceSyncHealth;
  latest: SalesforceSyncLogEntry | null;
  canSync: boolean;
  configured: boolean | null;
  onSynced: () => Promise<void>;
}) {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const active = useRef(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const object = objects[objectKey];
  const style = healthStyles[health.status];
  const HealthIcon = style?.icon ?? Activity;

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  async function sync() {
    if (!selectedOrg) return;
    setSyncing(true);
    setError('');
    setMessage('');
    try {
      const result = await api.capturePro<SalesforceSyncRun>(object.endpoint, { method: 'POST', body: JSON.stringify({ orgId: selectedOrg.id }) });
      if (!result || result.status !== 'Succeeded') throw new Error('Capture-Pro returned an unexpected sync result.');
      if (active.current) setMessage(object.message(result));
    } catch (requestError) {
      if (active.current) setError(requestError instanceof Error ? requestError.message : 'Salesforce sync failed.');
    } finally {
      await onSynced().catch(() => undefined);
      if (active.current) setSyncing(false);
    }
  }

  return (
    <section aria-labelledby={`salesforce-${objectKey}-sync-heading`}>
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id={`salesforce-${objectKey}-sync-heading`} className="text-lg font-semibold text-slate-900">{object.title}</h2>
            <div className="mt-1"><SalesforceSourceBadge objectName={object.objectName} /></div>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">{object.description}</p>
          </div>
          {canSync ? (
            <Button type="button" disabled={syncing || configured === false} onClick={() => void sync()}>
              <RefreshCw size={16} className={syncing ? 'animate-spin' : undefined} />{syncing ? 'Synchronizing...' : object.button}
            </Button>
          ) : <p className="text-sm text-slate-500">Only integration administrators can run a sync.</p>}
        </div>
        {syncing && <p className="text-xs text-slate-500">Large extracts can take several minutes. Keep this page open.</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">{message}</p>}
        <div className="grid gap-4 xl:grid-cols-2">
          <div className={`rounded-lg border p-4 ${style.className}`}>
            <div className="flex items-start gap-3">
              <HealthIcon size={20} className="mt-0.5 shrink-0" />
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide">API connection health</h3>
                <p className="mt-1 text-xl font-semibold" data-testid={`salesforce-health-status-${objectKey}`}>{health.status}</p>
                <p className="mt-1 text-sm">{style.description}</p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm" aria-label={`${object.title} health details`}>
              <dt className="opacity-80">Last successful sync</dt><dd>{dateTime(health.lastSuccessfulAt)}{health.lastSuccessfulAt && <span className="block text-xs opacity-80">{age(health.lastSuccessfulAt)}</span>}</dd>
              <dt className="opacity-80">Last failed sync</dt><dd>{dateTime(health.lastFailedAt)}</dd>
              <dt className="opacity-80">Consecutive failures</dt><dd>{health.consecutiveFailures}</dd>
              <dt className="opacity-80">Recent success rate</dt><dd>{health.recentRunCount ? `${health.recentSuccessCount} of ${health.recentRunCount} runs` : '—'}</dd>
            </dl>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last run</h3>
            {latest ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm" aria-label={`${object.title} last run details`}>
                <dt className="text-slate-500">Status</dt><dd className={latest.status === 'Succeeded' ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}>{latest.status}</dd>
                <dt className="text-slate-500">Started</dt><dd>{dateTime(latest.startedAt)}</dd>
                <dt className="text-slate-500">Completed</dt><dd>{dateTime(latest.completedAt)} ({duration(latest.startedAt, latest.completedAt)})</dd>
                <dt className="text-slate-500">Received / stored</dt><dd>{latest.receivedCount} / {latest.matchedCount}</dd>
                <dt className="text-slate-500">Changes</dt><dd>{latest.insertedCount} new, {latest.updatedCount} updated, {latest.removedCount} removed</dd>
                {latest.errorMessage && <><dt className="text-slate-500">Reason</dt><dd className="text-red-700">{latest.errorMessage}</dd></>}
              </dl>
            ) : <p className="mt-3 text-sm text-slate-500">No sync has run yet.</p>}
          </div>
        </div>
      </Card>
    </section>
  );
}

function SalesforceSyncHealthView({ orgId, productId }: { orgId: string; productId: string }) {
  const api = useApi();
  const active = useRef(true);
  const [log, setLog] = useState<SalesforceSyncLog | null>(null);
  const [canSync, setCanSync] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [spinergieConfigured, setSpinergieConfigured] = useState<boolean | null>(null);
  const [spinergieRefresh, setSpinergieRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLog = useCallback(async () => {
    const result = await api.capturePro<SalesforceSyncLog>(`/salesforce-opportunities/sync-runs?orgId=${encodeURIComponent(orgId)}`);
    if (!result?.health?.opportunities || !result.health.accounts || !result.health.competitors || !result.health.bidBudgets || !result.health.fabricationYards || !result.health.vessels || !result.lastRuns || !Array.isArray(result.runs)) {
      throw new Error('Capture-Pro returned an unexpected sync log.');
    }
    if (active.current) setLog(result);
  }, [api, orgId]);

  useEffect(() => {
    active.current = true;
    setLoading(true);
    Promise.all([
      loadLog(),
      api.get<MenuNode[]>(`/menus/mine?orgId=${encodeURIComponent(orgId)}`).then(async (menus) => {
        const editable = findMenu(menus)?.accessMode === 'editable';
        if (!active.current) return;
        setCanSync(editable);
        if (!editable) return;
        const settings = await api.get<CaptureProIntegrations>(`/organisations/${encodeURIComponent(orgId)}/modules/${encodeURIComponent(productId)}/integrations/capture-pro`)
          .catch(() => null);
        if (active.current) {
          setConfigured(settings ? settings.salesforce.clientSecretConfigured : null);
          setSpinergieConfigured(settings ? settings.spinergie.apiKeyConfigured : null);
        }
      }),
    ])
      .catch((requestError: unknown) => {
        if (active.current) setError(requestError instanceof Error ? requestError.message : 'Salesforce sync health could not be loaded.');
      })
      .finally(() => { if (active.current) setLoading(false); });
    return () => { active.current = false; };
  }, [api, orgId, productId, loadLog]);

  const refresh = () => {
    setError('');
    setSpinergieRefresh((value) => value + 1);
    loadLog().catch((requestError: unknown) => {
      if (active.current) setError(requestError instanceof Error ? requestError.message : 'Salesforce sync health could not be loaded.');
    });
  };

  return (
    <section aria-labelledby="salesforce-sync-heading" className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xs font-semibold uppercase text-teal-700">Capture-Pro Integrations</p>
          <h1 id="salesforce-sync-heading" className="mt-1 text-2xl font-semibold text-slate-950">Sync &amp; Health</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Salesforce and Spinergie sync health is based on recorded runs.</p>
        </div>
        <Button type="button" variant="ghost" onClick={refresh} disabled={loading}><RefreshCw size={16} />Refresh</Button>
      </header>
      {error && <Card><p role="alert" className="text-sm text-red-700">{error}</p></Card>}
      {canSync && configured === false && <p className="text-sm text-amber-700">Save Salesforce credentials in <Link to="/app/product/Capture-Pro/integrations" className="font-medium underline">Integrations</Link> before synchronizing.</p>}
      {loading ? <Card><p className="text-sm text-slate-500">Loading Salesforce sync health...</p></Card> : log && <>
        {(['opportunities', 'accounts', 'competitors', 'bidBudgets', 'fabricationYards', 'vessels'] as const).map((key) => (
          <ObjectSyncPanel key={key} objectKey={key} health={log.health[key]} latest={log.lastRuns[key]} canSync={canSync} configured={configured} onSynced={loadLog} />
        ))}
        <Card className="overflow-hidden p-0">
          <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900">Run log <span className="font-normal text-slate-500">(latest {log.runs.length})</span></h2>
          {log.runs.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">No sync runs have been recorded.</p> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm" aria-label="Salesforce sync run log">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <tr>{['Started', 'Type', 'Duration', 'Status', 'Received', 'Stored', 'New', 'Updated', 'Removed', 'Started by', 'Reason'].map((heading) => <th key={heading} scope="col" className="whitespace-nowrap px-4 py-3">{heading}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {log.runs.map((entry) => (
                    <tr key={entry.id}>
                      <td className="whitespace-nowrap px-4 py-3">{dateTime(entry.startedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{entry.objectType}</td>
                      <td className="whitespace-nowrap px-4 py-3">{duration(entry.startedAt, entry.completedAt)}</td>
                      <td className="px-4 py-3"><span className={`rounded px-2 py-0.5 text-xs font-medium ${entry.status === 'Succeeded' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{entry.status}</span></td>
                      <td className="px-4 py-3 tabular-nums">{entry.receivedCount}</td>
                      <td className="px-4 py-3 tabular-nums">{entry.matchedCount}</td>
                      <td className="px-4 py-3 tabular-nums">{entry.insertedCount}</td>
                      <td className="px-4 py-3 tabular-nums">{entry.updatedCount}</td>
                      <td className="px-4 py-3 tabular-nums">{entry.removedCount}</td>
                      <td className="whitespace-nowrap px-4 py-3">{entry.startedByCurrentUser ? 'You' : 'Another administrator'}</td>
                      <td className="min-w-64 px-4 py-3 text-red-700">{entry.errorMessage ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </>}
      <CaptureProSpinergieSyncPanel key={`${orgId}:${productId}`} orgId={orgId} canSync={canSync} configured={spinergieConfigured} refreshVersion={spinergieRefresh} />
      <CaptureProSpinergieSyncPanel key={`${orgId}:${productId}:charters`} orgId={orgId} canSync={canSync} configured={spinergieConfigured} refreshVersion={spinergieRefresh} dataset="charters" />
    </section>
  );
}
