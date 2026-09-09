import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { useApi } from '@/lib/ApiProvider';
import { useTheme } from '@/state/ThemeProvider';

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

const field = 'mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm';

// Global Administrator: platform-wide settings (default org, session timeout, banner).
export function AdminSettingsPage() {
  const api = useApi();
  const { refresh } = useTheme();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [generalStatus, setGeneralStatus] = useState('');
  const [bannerStatus, setBannerStatus] = useState('');

  const load = useCallback(() => {
    api.get<Settings>('/settings').then(setSettings).catch(() => setSettings(null));
    api.get<Org[]>('/organisations').then(setOrgs).catch(() => setOrgs([]));
  }, [api]);

  useEffect(() => load(), [load]);

  const patch = (p: Partial<Settings>) => setSettings((s) => (s ? { ...s, ...p } : s));

  const saveGeneral = async () => {
    if (!settings) return;
    if (!settings.defaultOrgId) {
      setGeneralStatus('Select a default organisation.');
      return;
    }
    setGeneralStatus('Saving…');
    try {
      await api.put('/settings', {
        defaultOrgId: settings.defaultOrgId,
        sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
        headerColor: settings.headerColor,
        headerTextColor: settings.headerTextColor,
      });
      await refresh();
      setGeneralStatus('Saved.');
    } catch (e) {
      setGeneralStatus((e as Error).message);
    }
  };

  const saveBanner = async () => {
    if (!settings) return;
    setBannerStatus('Saving…');
    try {
      await api.put('/settings', {
        bannerEnabled: settings.bannerEnabled,
        bannerBgColor: settings.bannerBgColor,
        bannerTextColor: settings.bannerTextColor,
        bannerContent: settings.bannerContent ?? '',
      });
      await refresh();
      setBannerStatus('Saved.');
    } catch (e) {
      setBannerStatus((e as Error).message);
    }
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
              onChange={(e) => {
                patch({ defaultOrgId: e.target.value });
                setGeneralStatus('');
              }}
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
            {generalStatus && <span className="text-sm text-slate-500">{generalStatus}</span>}
          </div>
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
            {bannerStatus && <span className="text-sm text-slate-500">{bannerStatus}</span>}
            <Button onClick={saveBanner}>Update Banner</Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
