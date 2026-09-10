import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Mail, Plus, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { useApi } from '@/lib/ApiProvider';
import { useTheme } from '@/state/ThemeProvider';
import { notify } from '@/lib/systemEvents';

interface Settings {
  id: string;
  defaultOrgId: string | null;
  sessionTimeoutMinutes: number;
  headerColor: string;
  headerTextColor: string;
  bannerEnabled: boolean;
  bannerBgColor: string;
  bannerTextColor: string;
  bannerContent: string | null;
}

interface Org {
  id: string;
  name: string;
}

interface SmtpConfiguration {
  id?: string;
  clientId: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  hasPassword: boolean;
  fromName: string;
  fromEmail: string;
  secure: boolean;
  enabled: boolean;
  isDefault: boolean;
}

const field = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm';

// Global Administrator: platform-wide settings (default org, session timeout, banner).
export function AdminSettingsPage() {
  const api = useApi();
  const { refresh } = useTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [smtpConfigurations, setSmtpConfigurations] = useState<SmtpConfiguration[]>([]);
  const [savingSmtp, setSavingSmtp] = useState(false);

  const load = useCallback(() => {
    api.get<Settings>('/settings').then(setSettings).catch(() => setSettings(null));
    api.get<Org[]>('/organisations').then(setOrgs).catch(() => setOrgs([]));
    api.get<Omit<SmtpConfiguration, 'clientId' | 'password'>[]>('/settings/smtp')
      .then((configurations) => setSmtpConfigurations(configurations.map((configuration) => ({ ...configuration, clientId: configuration.id ?? crypto.randomUUID(), password: '' }))))
      .catch(() => setSmtpConfigurations([]));
  }, [api]);

  useEffect(() => load(), [load]);

  const patch = (p: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...p } : s));
  const patchSmtp = (clientId: string, values: Partial<SmtpConfiguration>) => setSmtpConfigurations((current) => current.map((configuration) => configuration.clientId === clientId ? { ...configuration, ...values } : configuration));

  const addSmtp = () => {
    if (smtpConfigurations.length >= 3) return;
    setSmtpConfigurations((current) => [...current, {
      clientId: crypto.randomUUID(),
      name: `SMTP ${current.length + 1}`,
      host: '',
      port: 587,
      username: '',
      password: '',
      hasPassword: false,
      fromName: '',
      fromEmail: '',
      secure: true,
      enabled: true,
      isDefault: current.length === 0,
    }]);
  };

  const removeSmtp = (clientId: string) => setSmtpConfigurations((current) => {
    const removed = current.find((configuration) => configuration.clientId === clientId);
    const remaining = current.filter((configuration) => configuration.clientId !== clientId);
    if (removed?.isDefault && remaining.length > 0) remaining[0] = { ...remaining[0], isDefault: true, enabled: true };
    return remaining;
  });

  const moveSmtp = (index: number, direction: -1 | 1) => setSmtpConfigurations((current) => {
    const target = index + direction;
    if (target < 0 || target >= current.length) return current;
    const reordered = [...current];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    return reordered;
  });

  const makeDefault = (clientId: string) => setSmtpConfigurations((current) => {
    const primary = current.find((configuration) => configuration.clientId === clientId);
    if (!primary) return current;
    return [
      { ...primary, isDefault: true, enabled: true },
      ...current.filter((configuration) => configuration.clientId !== clientId).map((configuration) => ({ ...configuration, isDefault: false })),
    ];
  });

  const saveSmtp = async () => {
    const invalid = smtpConfigurations.find((configuration) => !configuration.name.trim() || !configuration.host.trim() || !configuration.fromName.trim() || !configuration.fromEmail.trim() || (!configuration.hasPassword && !configuration.password));
    if (invalid) {
      notify('Complete all required SMTP fields, including a password for new configurations.', 'warning');
      return;
    }
    if (smtpConfigurations.length > 0 && smtpConfigurations.filter((configuration) => configuration.isDefault).length !== 1) {
      notify('Select one primary SMTP configuration.', 'warning');
      return;
    }
    setSavingSmtp(true);
    try {
      const saved = await api.put<Omit<SmtpConfiguration, 'clientId' | 'password'>[]>('/settings/smtp', {
        configurations: smtpConfigurations.map(({ clientId: _clientId, hasPassword: _hasPassword, ...configuration }) => configuration),
      });
      setSmtpConfigurations(saved.map((configuration) => ({ ...configuration, clientId: configuration.id ?? crypto.randomUUID(), password: '' })));
      notify('SMTP configurations saved.', 'success');
    } catch {
      // API errors are displayed by the global notification host.
    } finally {
      setSavingSmtp(false);
    }
  };

  const saveGeneral = async () => {
    if (!settings) return;
    if (!settings.defaultOrgId) {
      notify('Select a default organisation.', 'warning');
      return;
    }
    try {
      await api.put('/settings', {
        defaultOrgId: settings.defaultOrgId,
        sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
        headerColor: settings.headerColor,
        headerTextColor: settings.headerTextColor,
      });
      await refresh();
      notify('General settings saved.', 'success');
    } catch {}
  };

  const saveBanner = async () => {
    if (!settings) return;
    try {
      await api.put('/settings', {
        bannerEnabled: settings.bannerEnabled,
        bannerBgColor: settings.bannerBgColor,
        bannerTextColor: settings.bannerTextColor,
        bannerContent: settings.bannerContent ?? '',
      });
      await refresh();
      notify('Site banner updated.', 'success');
    } catch {}
  };

  if (!settings) return <p className="text-slate-400">Loading settings…</p>;

  return (
    <div className="max-w-4xl">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-semibold text-slate-900">Site Settings</h1>
        <p className="mt-1 text-slate-500">Manage your site settings here</p>
      </div>

      {/* General settings */}
      <section className="mt-8">
        <h2 className="font-semibold text-slate-800">General</h2>
        <p className="mt-1 text-sm text-slate-500">
          Defaults applied across the platform for new users and sessions.
        </p>
        <Card className="mt-4 grid gap-6 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-600">Default organisation for new users</span>
            <select
              required
              aria-invalid={!settings.defaultOrgId}
              className={`${field} ${!settings.defaultOrgId ? 'border-red-500' : ''}`}
              value={settings.defaultOrgId ?? ''}
              onChange={(e) => patch({ defaultOrgId: e.target.value })}
            >
              <option value="" disabled>Select an organisation</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            {!settings.defaultOrgId && (
              <span className="mt-1 block text-xs text-red-600">A default organisation is required.</span>
            )}
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Session timeout (minutes)</span>
            <input
              type="number"
              min={1}
              max={1440}
              className={field}
              value={settings.sessionTimeoutMinutes}
              onChange={(e) => patch({ sessionTimeoutMinutes: Number(e.target.value) })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Header Color</span>
            <input
              type="color"
              className="mt-1 block h-10 w-14 cursor-pointer rounded-md border border-slate-300"
              value={settings.headerColor}
              onChange={(e) => patch({ headerColor: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">Header Text Color</span>
            <input
              type="color"
              className="mt-1 block h-10 w-14 cursor-pointer rounded-md border border-slate-300"
              value={settings.headerTextColor}
              onChange={(e) => patch({ headerTextColor: e.target.value })}
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button onClick={saveGeneral} disabled={!settings.defaultOrgId}>Save changes</Button>
          </div>
        </Card>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-semibold text-slate-800">SMTP</h2><p className="mt-1 text-sm text-slate-500">Configure a primary mail service and up to two ordered fallbacks.</p></div>
          <Button variant="secondary" onClick={addSmtp} disabled={smtpConfigurations.length >= 3}><Plus size={16} />Add SMTP</Button>
        </div>
        <Card className="mt-4 p-0">
          {smtpConfigurations.length === 0 && <div className="px-6 py-10 text-center"><Mail size={26} className="mx-auto text-slate-400" /><p className="mt-2 text-sm text-slate-500">No SMTP service is configured.</p></div>}
          {smtpConfigurations.map((configuration, index) => (
            <div key={configuration.clientId} className="border-b border-slate-200 p-6 last:border-b-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3"><span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-sm font-semibold text-slate-600">{index + 1}</span><div><h3 className="font-semibold text-slate-900">{configuration.name || `SMTP ${index + 1}`}</h3><p className="text-xs text-slate-500">{configuration.isDefault ? 'Primary service' : `Fallback ${index}`}</p></div></div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveSmtp(index, -1)} disabled={index === 0} className="rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label={`Move ${configuration.name} up`} title="Move up"><ArrowUp size={17} /></button>
                  <button type="button" onClick={() => moveSmtp(index, 1)} disabled={index === smtpConfigurations.length - 1} className="rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label={`Move ${configuration.name} down`} title="Move down"><ArrowDown size={17} /></button>
                  <button type="button" onClick={() => removeSmtp(configuration.clientId)} className="rounded p-2 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${configuration.name}`} title="Remove"><Trash2 size={17} /></button>
                </div>
              </div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="text-sm text-slate-600">Configuration name<span className="text-red-600"> *</span><input className={field} value={configuration.name} onChange={(event) => patchSmtp(configuration.clientId, { name: event.target.value })} /></label>
                <label className="text-sm text-slate-600 sm:col-span-2">SMTP host<span className="text-red-600"> *</span><input className={field} placeholder="smtp.example.com" value={configuration.host} onChange={(event) => patchSmtp(configuration.clientId, { host: event.target.value })} /></label>
                <label className="text-sm text-slate-600">Port<span className="text-red-600"> *</span><input type="number" min={1} max={65535} className={field} value={configuration.port} onChange={(event) => patchSmtp(configuration.clientId, { port: Number(event.target.value) })} /></label>
                <label className="text-sm text-slate-600">Username<input autoComplete="off" className={field} value={configuration.username} onChange={(event) => patchSmtp(configuration.clientId, { username: event.target.value })} /></label>
                <label className="text-sm text-slate-600">Password{!configuration.hasPassword && <span className="text-red-600"> *</span>}<input type="password" autoComplete="new-password" className={field} placeholder={configuration.hasPassword ? 'Leave blank to keep current password' : 'Enter password'} value={configuration.password} onChange={(event) => patchSmtp(configuration.clientId, { password: event.target.value })} /></label>
                <label className="text-sm text-slate-600">From name<span className="text-red-600"> *</span><input className={field} value={configuration.fromName} onChange={(event) => patchSmtp(configuration.clientId, { fromName: event.target.value })} /></label>
                <label className="text-sm text-slate-600 sm:col-span-2">From email<span className="text-red-600"> *</span><input type="email" className={field} value={configuration.fromEmail} onChange={(event) => patchSmtp(configuration.clientId, { fromEmail: event.target.value })} /></label>
              </div>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3">
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="radio" name="default-smtp" checked={configuration.isDefault} onChange={() => makeDefault(configuration.clientId)} className="accent-brand" />Primary/default</label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={configuration.enabled} disabled={configuration.isDefault} onChange={(event) => patchSmtp(configuration.clientId, { enabled: event.target.checked })} className="accent-brand" />Enabled</label>
                <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={configuration.secure} onChange={(event) => patchSmtp(configuration.clientId, { secure: event.target.checked })} className="accent-brand" />Use TLS</label>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 bg-slate-50 px-6 py-4"><p className="text-xs text-slate-500">Mail delivery tries enabled services from top to bottom, starting with the primary.</p><Button onClick={() => void saveSmtp()} disabled={savingSmtp}>{savingSmtp ? 'Saving...' : 'Save SMTP'}</Button></div>
        </Card>
      </section>

      {/* Site banner */}
      <section className="mt-10">
        <h2 className="font-semibold text-slate-800">Site Banner</h2>
        <p className="mt-1 text-sm text-slate-500">
          The site banner is a message shown at the top of the site. It can be used to display
          important information to your users.
        </p>

        <Card className="mt-4">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <div className="text-sm font-medium text-slate-700">Enabled</div>
              <div className="mt-2">
                <Toggle
                  checked={settings.bannerEnabled}
                  onChange={(v) => patch({ bannerEnabled: v })}
                  label="Banner enabled"
                />
              </div>
            </div>
            <div className="flex gap-8">
              <label className="text-sm">
                <span className="font-medium text-slate-700">Background Color</span>
                <input
                  type="color"
                  className="mt-2 block h-10 w-14 cursor-pointer rounded-md border border-slate-300"
                  value={settings.bannerBgColor}
                  onChange={(e) => patch({ bannerBgColor: e.target.value })}
                />
              </label>
              <label className="text-sm">
                <span className="font-medium text-slate-700">Text Color</span>
                <input
                  type="color"
                  className="mt-2 block h-10 w-14 cursor-pointer rounded-md border border-slate-300"
                  value={settings.bannerTextColor}
                  onChange={(e) => patch({ bannerTextColor: e.target.value })}
                />
              </label>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-sm font-medium text-slate-700">Content</div>
            <textarea
              rows={4}
              className={field + ' font-mono'}
              value={settings.bannerContent ?? ''}
              onChange={(e) => patch({ bannerContent: e.target.value })}
            />
            <p className="mt-1 text-xs text-slate-500">The content to show in the banner, HTML is allowed</p>
          </div>

          <div className="mt-4 flex items-center justify-end gap-3">
            <Button onClick={saveBanner}>Update Banner</Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
