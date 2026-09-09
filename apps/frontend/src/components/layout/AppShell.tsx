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

// Authenticated shell: fixed header, collapsible sidebar, scrollable content.
export function AppShell() {
  const api = useApi();
  const location = useLocation();
  const { selectedOrg } = useOrg();
  const [collapsed, setCollapsed] = useState(false);
  const [moduleName, setModuleName] = useState<string | null>(null);
  const [themeCustomizerOpen, setThemeCustomizerOpen] = useState(false);
  const { userTheme } = useTheme();
  useAdministrationSession(api, selectedOrg?.id, !location.pathname.startsWith('/app/product/'));
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

  return (
    <div className="flex h-screen flex-col">
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
