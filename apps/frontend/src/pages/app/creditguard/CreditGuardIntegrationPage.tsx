import { FormEvent, useEffect, useState } from 'react';
import { Copy, KeyRound, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import type { MenuNode, Product } from '@platform/shared';
import { useOutletContext } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useApi } from '@/lib/ApiProvider';
import { notify } from '@/lib/systemEvents';
import { useOrg } from '@/state/OrgProvider';

interface IntegrationConfiguration {
  provider: 'signit';
  baseUrl: string;
  authorizationKeyConfigured: boolean;
  webhookTokenConfigured: boolean;
  webhookTokenPrefix: string | null;
  webhookTokenCreatedAt: string | null;
  webhookPath: string;
  updatedAt: string | null;
}

interface GeneratedWebhookToken {
  token: string;
  webhookPath: string;
  tokenPrefix: string;
  createdAt: string;
}

const route = '/app/product/CreditGuard/application-setup/integration';
const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand disabled:bg-slate-100';

function findMenu(nodes: MenuNode[]): MenuNode | undefined {
  for (const node of nodes) {
    if (node.route === route) return node;
    const child = findMenu(node.children);
    if (child) return child;
  }
  return undefined;
}

export function CreditGuardIntegrationPage() {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const { setModuleName } = useOutletContext<{ setModuleName: (name: string | null) => void }>();
  const [productId, setProductId] = useState('');
  const [configuration, setConfiguration] = useState<IntegrationConfiguration | null>(null);
  const [baseUrl, setBaseUrl] = useState('');
  const [authorizationKey, setAuthorizationKey] = useState('');
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [generatedWebhookToken, setGeneratedWebhookToken] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setModuleName('CreditGuard');
    return () => setModuleName(null);
  }, [setModuleName]);

  useEffect(() => {
    setProductId('');
    setConfiguration(null);
    setBaseUrl('');
    setAuthorizationKey('');
    setGeneratedWebhookToken('');
    setCanEdit(false);
    setError('');
    if (!selectedOrg) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      api.get<Product[]>(`/products?orgId=${encodeURIComponent(selectedOrg.id)}`),
      api.get<MenuNode[]>(`/menus/mine?orgId=${encodeURIComponent(selectedOrg.id)}`),
    ])
      .then(async ([products, menus]) => {
        const product = products.find((candidate) => candidate.code.toLowerCase() === 'creditguard');
        if (!product) throw new Error('CreditGuard is not available for this organisation.');
        const menu = findMenu(menus);
        if (!menu) throw new Error('You do not have access to Integration.');
        setProductId(product.id);
        setCanEdit(menu.accessMode !== 'readonly');
        const result = await api.get<IntegrationConfiguration>(
          `/organisations/${selectedOrg.id}/modules/${product.id}/integrations/signit`,
        );
        setConfiguration(result);
        setBaseUrl(result.baseUrl);
      })
      .catch((requestError) => setError((requestError as Error).message))
      .finally(() => setLoading(false));
  }, [api, selectedOrg]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!selectedOrg || !productId || !baseUrl.trim() || (!configuration?.authorizationKeyConfigured && !authorizationKey.trim())) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.put<IntegrationConfiguration>(
        `/organisations/${selectedOrg.id}/modules/${productId}/integrations/signit`,
        { baseUrl, ...(authorizationKey.trim() ? { authorizationKey } : {}) },
      );
      setConfiguration(result);
      setBaseUrl(result.baseUrl);
      setAuthorizationKey('');
      notify('Signit integration settings saved.', 'success');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function removeKey() {
    if (!selectedOrg || !productId || !configuration?.authorizationKeyConfigured) return;
    setSaving(true);
    setError('');
    try {
      const result = await api.put<IntegrationConfiguration>(
        `/organisations/${selectedOrg.id}/modules/${productId}/integrations/signit`,
        { clearAuthorizationKey: true },
      );
      setConfiguration(result);
      setAuthorizationKey('');
      notify('Signit authorization key removed.', 'success');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function generateWebhookToken() {
    if (!selectedOrg || !productId) return;
    if (configuration?.webhookTokenConfigured && !window.confirm('Rotate the webhook token? The current token will stop working immediately.')) return;
    setWebhookSaving(true);
    setError('');
    try {
      const result = await api.post<GeneratedWebhookToken>(
        `/organisations/${selectedOrg.id}/modules/${productId}/integrations/signit/webhook-token`,
      );
      setGeneratedWebhookToken(result.token);
      setConfiguration((current) => current ? {
        ...current,
        webhookTokenConfigured: true,
        webhookTokenPrefix: result.tokenPrefix,
        webhookTokenCreatedAt: result.createdAt,
        webhookPath: result.webhookPath,
      } : current);
      notify('Webhook token generated. Store it securely now.', 'success');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setWebhookSaving(false);
    }
  }

  async function revokeWebhookToken() {
    if (!selectedOrg || !productId || !configuration?.webhookTokenConfigured
      || !window.confirm('Revoke the webhook token? Signit callbacks will stop working immediately.')) return;
    setWebhookSaving(true);
    setError('');
    try {
      await api.del(`/organisations/${selectedOrg.id}/modules/${productId}/integrations/signit/webhook-token`);
      setGeneratedWebhookToken('');
      setConfiguration((current) => current ? {
        ...current,
        webhookTokenConfigured: false,
        webhookTokenPrefix: null,
        webhookTokenCreatedAt: null,
      } : current);
      notify('Webhook token revoked.', 'success');
    } catch (requestError) {
      setError((requestError as Error).message);
    } finally {
      setWebhookSaving(false);
    }
  }

  async function copyValue(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    notify(`${label} copied.`, 'success');
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-brand/10 p-2 text-brand"><KeyRound size={22} /></div>
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Integration</h1>
          <p className="text-sm text-slate-500">Signit API access</p>
        </div>
      </div>

      {error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <Card className="p-6">
        {loading ? (
          <p className="text-sm text-slate-500">Loading integration settings...</p>
        ) : configuration ? (
          <form className="space-y-5" onSubmit={save}>
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <ShieldCheck size={20} className={configuration.authorizationKeyConfigured ? 'text-emerald-600' : 'text-slate-400'} />
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Signit</h2>
                  <p className="text-sm text-slate-500">
                    {configuration.authorizationKeyConfigured ? 'Authorization key configured' : 'Authorization key not configured'}
                  </p>
                </div>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${configuration.authorizationKeyConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                {configuration.authorizationKeyConfigured ? 'Configured' : 'Not configured'}
              </span>
            </div>

            <label className="block text-sm font-medium text-slate-700">
              Base URL
              <input
                type="url"
                className={`${inputClass} mt-1.5`}
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="https://api.signit.example"
                pattern="https?://.*"
                title="Enter an HTTP or HTTPS URL"
                disabled={!canEdit || saving}
                required
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Authorization key
              <input
                type="password"
                autoComplete="new-password"
                className={`${inputClass} mt-1.5`}
                value={authorizationKey}
                onChange={(event) => setAuthorizationKey(event.target.value)}
                placeholder={configuration.authorizationKeyConfigured ? 'Enter a replacement key' : 'Enter authorization key'}
                disabled={!canEdit || saving}
                required={!configuration.authorizationKeyConfigured}
              />
            </label>

            {configuration.updatedAt && (
              <p className="text-xs text-slate-500">Last updated {new Date(configuration.updatedAt).toLocaleString()}</p>
            )}

            {canEdit && (
              <div className="flex flex-wrap justify-end gap-2">
                {configuration.authorizationKeyConfigured && (
                  <Button type="button" variant="danger" onClick={removeKey} disabled={saving}>
                    <Trash2 size={16} /> Remove key
                  </Button>
                )}
                <Button type="submit" disabled={saving || !baseUrl.trim() || (!configuration.authorizationKeyConfigured && !authorizationKey.trim())}>
                  <Save size={16} /> {saving ? 'Saving...' : 'Save configuration'}
                </Button>
              </div>
            )}

            <div className="space-y-4 border-t border-slate-200 pt-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Signit webhook</h2>
                  <p className="text-sm text-slate-500">
                    {configuration.webhookTokenConfigured
                      ? `Token ${configuration.webhookTokenPrefix}... is configured`
                      : 'Webhook token not configured'}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${configuration.webhookTokenConfigured ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  {configuration.webhookTokenConfigured ? 'Configured' : 'Not configured'}
                </span>
              </div>

              <label className="block text-sm font-medium text-slate-700">
                Webhook URL
                <span className="mt-1.5 flex gap-2">
                  <input
                    className={inputClass}
                    value={`${window.location.origin}${configuration.webhookPath}`}
                    readOnly
                  />
                  <Button type="button" variant="secondary" aria-label="Copy webhook URL" onClick={() => copyValue(`${window.location.origin}${configuration.webhookPath}`, 'Webhook URL')}>
                    <Copy size={16} />
                  </Button>
                </span>
              </label>

              {generatedWebhookToken && (
                <div role="status" className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-4">
                  <p className="text-sm font-medium text-amber-900">Store this token securely. It will not be shown again.</p>
                  <div className="flex gap-2">
                    <input aria-label="Generated webhook token" className={inputClass} value={generatedWebhookToken} readOnly />
                    <Button type="button" variant="secondary" aria-label="Copy webhook token" onClick={() => copyValue(generatedWebhookToken, 'Webhook token')}>
                      <Copy size={16} />
                    </Button>
                  </div>
                </div>
              )}

              {configuration.webhookTokenCreatedAt && (
                <p className="text-xs text-slate-500">Token generated {new Date(configuration.webhookTokenCreatedAt).toLocaleString()}</p>
              )}

              {canEdit && (
                <div className="flex flex-wrap justify-end gap-2">
                  {configuration.webhookTokenConfigured && (
                    <Button type="button" variant="danger" onClick={revokeWebhookToken} disabled={webhookSaving}>
                      <Trash2 size={16} /> Revoke token
                    </Button>
                  )}
                  <Button type="button" variant="secondary" onClick={generateWebhookToken} disabled={webhookSaving || !configuration.authorizationKeyConfigured}>
                    <RefreshCw size={16} /> {webhookSaving ? 'Updating...' : configuration.webhookTokenConfigured ? 'Rotate token' : 'Generate token'}
                  </Button>
                </div>
              )}
            </div>
          </form>
        ) : null}
      </Card>
    </div>
  );
}
