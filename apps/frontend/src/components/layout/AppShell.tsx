import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { AppSidebar } from './AppSidebar';
import { SiteBanner } from './SiteBanner';
import { ThemeCustomizer } from './ThemeCustomizer';
import { useTheme } from '@/state/ThemeProvider';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { useAdministrationSession } from '@/hooks/useAdministrationSession';
import { Building2, RefreshCw } from 'lucide-react';

// Authenticated shell: fixed header, collapsible sidebar, scrollable content.
export function AppShell() {
  const api = useApi();
  const location = useLocation();
  const { selectedOrg, organisations, loading, error, setSelectedOrg, reloadOrganisations } = useOrg();
  const [collapsed, setCollapsed] = useState(false);
  const [moduleName, setModuleName] = useState<string | null>(null);
  const [themeCustomizerOpen, setThemeCustomizerOpen] = useState(false);
  const { userTheme } = useTheme();
  useAdministrationSession(api, loading ? undefined : selectedOrg?.id, !location.pathname.startsWith('/app/product/'));
  const palette = {
    slate: { background: '#f8fafc', surface: '#ffffff', text: '#0f172a', muted: '#64748b', border: '#e2e8f0' },
    ocean: { background: '#f0f9ff', surface: '#ffffff', text: '#0c4a6e', muted: '#64748b', border: '#bae6fd' },
    forest: { background: '#f0fdf4', surface: '#ffffff', text: '#14532d', muted: '#64748b', border: '#bbf7d0' },
    rose: { background: '#fff1f2', surface: '#ffffff', text: '#4c0519', muted: '#64748b', border: '#fecdd3' },
  }[userTheme.preset];
  const colors = userTheme.mode === 'dark'
    ? { background: '#111827', surface: '#1f2937', text: '#f8fafc', muted: '#cbd5e1', border: '#475569' }
    : palette;
  const themeStyle = {
    '--user-theme-background': colors.background,
    '--user-theme-surface': colors.surface,
    '--user-theme-text': colors.text,
    '--user-theme-muted': colors.muted,
    '--user-theme-border': colors.border,
    '--user-theme-brand': userTheme.brandColor,
    '--user-theme-radius': `${userTheme.radius}px`,
  } as React.CSSProperties;

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">Loading organisations...</div>;
  }

  if (!selectedOrg) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-6 shadow-lg">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand"><Building2 size={20} /></span>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Select Organisation</h1>
              <p className="mt-1 text-sm text-slate-600">Choose the organisation you want to access for this session.</p>
            </div>
          </div>

          {error ? (
            <div className="mt-6 rounded-md border border-red-200 bg-red-50 p-4">
              <p role="alert" className="text-sm text-red-700">{error}</p>
              <button type="button" onClick={reloadOrganisations} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-red-700 hover:text-red-900">
                <RefreshCw size={15} /> Retry
              </button>
            </div>
          ) : organisations.length === 0 ? (
            <p className="mt-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Your account is not assigned to an active organisation.</p>
          ) : (
            <div className="mt-6 grid gap-3">
              {organisations.map((organisation) => (
                <button
                  key={organisation.id}
                  type="button"
                  onClick={() => setSelectedOrg(organisation)}
                  className="flex w-full items-center justify-between rounded-md border border-slate-200 px-4 py-3 text-left transition hover:border-brand hover:bg-brand/5 focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
                >
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">{organisation.name}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">{organisation.membership}</span>
                  </span>
                  <span className="text-sm font-medium text-brand">Continue</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <SiteBanner />
      <AppHeader onToggleSidebar={() => setCollapsed((c) => !c)} onOpenThemeCustomizer={() => setThemeCustomizerOpen(true)} moduleName={moduleName} />
      <div className="user-theme flex flex-1 overflow-hidden" style={themeStyle}>
        <AppSidebar collapsed={collapsed} />
        <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet context={{ setModuleName }} />
        </main>
      </div>
      <ThemeCustomizer open={themeCustomizerOpen} onClose={() => setThemeCustomizerOpen(false)} />
    </div>
  );
}
