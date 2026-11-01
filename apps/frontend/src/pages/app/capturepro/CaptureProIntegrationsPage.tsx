import { useEffect, useRef, useState, type FormEvent } from 'react';
import { KeyRound, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { Link, useOutletContext } from 'react-router-dom';
import type { CaptureProIntegrations, SalesforceIntegrationInput, SpinergieIntegrationInput } from '@platform/shared';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { CaptureProSharePointConnection } from './CaptureProSharePointConnection';

const defaultTokenUrl = 'https://mcdermott.my.salesforce.com/services/oauth2/token';
const inputClass = 'mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-slate-100 read-only:bg-slate-50';

export function CaptureProIntegrationsPage() {
  const { selectedOrg } = useOrg();
  const { productId } = useOutletContext<{ productId: string }>();
  if (!selectedOrg) return <p role="alert">Select an organisation to manage integrations.</p>;
  return <IntegrationSettings key={`${selectedOrg.id}:${productId}`} orgId={selectedOrg.id} productId={productId} />;
}

function IntegrationSettings({ orgId, productId }: { orgId: string; productId: string }) {
  const api = useApi();
  const endpoint = `/organisations/${encodeURIComponent(orgId)}/modules/${encodeURIComponent(productId)}/integrations/capture-pro`;
  const active = useRef(true);
  const [configuration, setConfiguration] = useState<CaptureProIntegrations | null>(null);
  const [accessTokenUrl, setAccessTokenUrl] = useState(defaultTokenUrl);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get<CaptureProIntegrations>(endpoint)
      .then((result) => {
        if (cancelled) return;
        setConfiguration(result);
        setAccessTokenUrl(result.salesforce.accessTokenUrl || defaultTokenUrl);
        setClientId(result.salesforce.clientId);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError instanceof Error ? requestError.message : 'Unable to load integration settings.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, endpoint, attempt]);

  async function save(provider: 'salesforce' | 'spinergie', event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSuccess('');
    const body: SalesforceIntegrationInput | SpinergieIntegrationInput = provider === 'salesforce'
      ? {
        authType: 'OAuth2.0',
        grantType: 'client_credentials',
        accessTokenUrl,
        clientId: clientId.trim(),
        ...(clientSecret ? { clientSecret } : {}),
      }
      : { apiKey };
    try {
      const result = await api.put<CaptureProIntegrations>(`${endpoint}/${provider}`, body);
      if (!active.current) return;
      setConfiguration(result);
      if (provider === 'salesforce') {
        setAccessTokenUrl(result.salesforce.accessTokenUrl);
        setClientId(result.salesforce.clientId);
        setClientSecret('');
      } else {
        setApiKey('');
      }
      setSuccess(`${provider === 'salesforce' ? 'Salesforce' : 'Spinergie'} integration settings saved. No connection test or data synchronization has run.`);
    } catch (requestError) {
      if (active.current) setError(requestError instanceof Error ? requestError.message : 'Unable to save integration settings.');
    } finally {
      if (active.current) setSaving(false);
    }
  }

  async function remove(provider: 'salesforce' | 'spinergie') {
    const name = provider === 'salesforce' ? 'Salesforce' : 'Spinergie';
    if (!window.confirm(`Remove the saved ${name} integration credentials for this organisation?`)) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await api.del<CaptureProIntegrations>(`${endpoint}/${provider}`);
      if (!active.current) return;
      setConfiguration(result);
      if (provider === 'salesforce') {
        setAccessTokenUrl(defaultTokenUrl);
        setClientId('');
        setClientSecret('');
      } else {
        setApiKey('');
      }
      setSuccess(`${name} integration credentials removed.`);
    } catch (requestError) {
      if (active.current) setError(requestError instanceof Error ? requestError.message : 'Unable to remove integration credentials.');
    } finally {
      if (active.current) setSaving(false);
    }
  }

  return (
    <section aria-labelledby="integrations-heading" className="space-y-6">
      <header className="border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase text-teal-700">Capture-Pro administration</p>
        <h1 id="integrations-heading" className="mt-1 text-2xl font-semibold text-slate-950">Integrations</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Configure Salesforce and Spinergie API connections for the selected organisation.</p>
      </header>
      {error && <Card><p role="alert" className="text-sm text-red-700">{error}</p>{!configuration && <Button variant="secondary" className="mt-3" onClick={() => setAttempt((value) => value + 1)}>Retry loading integrations</Button>}</Card>}
      {success && <p role="status" className="rounded-md border border-teal-200 bg-teal-50 p-4 text-sm text-teal-800">{success}</p>}
      {loading ? <Card><p className="text-sm text-slate-600">Checking integration administrator access...</p></Card> : configuration && <>
        <div className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <ShieldCheck size={20} className="shrink-0 text-teal-700" />
          <p>Only Capture-Pro Module Administrators, Global Administrators, and organisation Owners/Admins can configure these connections. Secrets are encrypted on the server and are never displayed after saving. Saving does not contact Salesforce or Spinergie; run opportunity syncs from Capture-Pro &gt; Sync &amp; Health.</p>
        </div>
        <div className="grid gap-6 xl:grid-cols-2">
          <Card>
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Salesforce</h2><span className="text-xs font-medium text-slate-600">{configuration.salesforce.clientSecretConfigured ? 'Credentials saved' : 'Not configured'}</span></div>
            <p className="mt-2 text-sm text-slate-600">OAuth 2.0 access using the Client Credentials grant.</p>
            <form onSubmit={(event) => void save('salesforce', event)} className="mt-5">
              <fieldset disabled={saving} className="space-y-4">
                <label className="block text-sm font-medium">Auth Type<input value="OAuth2.0" readOnly className={inputClass} /></label>
                <label className="block text-sm font-medium">Grant Type<input value="Client Credentials" readOnly className={inputClass} /></label>
                <label className="block text-sm font-medium">Access Token URL<input type="url" required maxLength={2048} value={accessTokenUrl} onChange={(event) => setAccessTokenUrl(event.target.value)} className={inputClass} /></label>
                <label className="block text-sm font-medium">Client ID<input required maxLength={1000} autoComplete="off" value={clientId} onChange={(event) => setClientId(event.target.value)} className={inputClass} /></label>
                <label className="block text-sm font-medium">Client Secret<input type="password" autoComplete="new-password" required={!configuration.salesforce.clientSecretConfigured} maxLength={10000} value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} aria-describedby="salesforce-secret-help" className={inputClass} /></label>
                <p id="salesforce-secret-help" className="text-xs text-slate-500">{configuration.salesforce.clientSecretConfigured ? 'Leave blank to keep the saved secret. Changing the Client ID or token URL requires a new secret.' : 'Enter the connected app Client Secret. It will not be returned after saving.'}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit"><Save size={16} />Save Salesforce</Button>
                  {configuration.salesforce.clientSecretConfigured && <Button type="button" variant="danger" onClick={() => void remove('salesforce')}><Trash2 size={16} />Remove Salesforce credentials</Button>}
                </div>
              </fieldset>
            </form>
            <p className="mt-6 border-t border-slate-200 pt-4 text-sm text-slate-600">Opportunity sync, connection health, and the run log are in <Link to="/app/product/Capture-Pro/salesforce-sync" className="font-medium text-teal-700 hover:underline">Capture-Pro &gt; Sync &amp; Health</Link>.</p>
          </Card>
          <Card>
            <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Spinergie</h2><span className="text-xs font-medium text-slate-600">{configuration.spinergie.apiKeyConfigured ? 'API key saved' : 'Not configured'}</span></div>
            <p className="mt-2 text-sm text-slate-600">Configure access using a Spinergie API key.</p>
            <form onSubmit={(event) => void save('spinergie', event)} className="mt-5">
              <fieldset disabled={saving} className="space-y-4">
                <label className="block text-sm font-medium">API Key<input type="password" autoComplete="new-password" required maxLength={10000} value={apiKey} onChange={(event) => setApiKey(event.target.value)} aria-describedby="spinergie-key-help" className={inputClass} /></label>
                <p id="spinergie-key-help" className="text-xs text-slate-500">{configuration.spinergie.apiKeyConfigured ? 'A key is already saved. Enter a new key only to replace it.' : 'Enter the API key supplied by Spinergie. No other connection fields are required.'}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit"><KeyRound size={16} />Save Spinergie</Button>
                  {configuration.spinergie.apiKeyConfigured && <Button type="button" variant="danger" onClick={() => void remove('spinergie')}><Trash2 size={16} />Remove Spinergie credentials</Button>}
                </div>
              </fieldset>
            </form>
          </Card>
        </div>
        <CaptureProSharePointConnection orgId={orgId} productId={productId} />
      </>}
    </section>
  );
}
