import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { CircleHelp, Menu as MenuIcon, Palette } from 'lucide-react';
import { clsx } from 'clsx';
import { Logo } from './Logo';
import { LanguageSelector } from './LanguageSelector';
import { OrgSelector } from './OrgSelector';
import { useTheme } from '@/state/ThemeProvider';
import { getContextualHelpTopic } from '@/help/helpContent';

interface Props {
  onToggleSidebar: () => void;
  onOpenThemeCustomizer: () => void;
  moduleName?: string | null;
}

const tabs = [
  { key: 'products', to: '/app/products' },
];

export function AppHeader({ onToggleSidebar, onOpenThemeCustomizer, moduleName }: Props) {
  const { t } = useTranslation();
  const { headerColor, headerTextColor } = useTheme();
  const location = useLocation();
  const onHelpScreen = location.pathname.startsWith('/app/help');
  const helpPath = onHelpScreen ? '/app/help' : `/app/help/${getContextualHelpTopic(location.pathname)}`;
  const helpState = onHelpScreen ? undefined : { from: `${location.pathname}${location.search}` };

  return (
    <header
      className="flex h-16 items-center justify-between border-b border-slate-200 px-4"
      style={{ backgroundColor: headerColor, color: headerTextColor }}
    >
      {/* Left: sidebar toggle + responsive brand */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="rounded-md p-2 hover:bg-black/5"
          style={{ color: headerTextColor }}
          aria-label="Toggle sidebar"
        >
          <MenuIcon size={20} />
        </button>
        <Logo textColor={headerTextColor} moduleName={moduleName} />
      </div>

      {/* Middle: primary tabs (hidden on small screens) */}
      <nav className="hidden items-center gap-1 md:flex">
        {tabs.map((tab) => (
          <NavLink
            key={tab.key}
            to={tab.to}
            className={({ isActive }) =>
              clsx(
                'rounded-md px-4 py-2 text-sm font-medium',
                isActive ? 'bg-brand/10 text-brand-header' : 'hover:bg-black/5',
              )
            }
            style={({ isActive }) => (isActive ? undefined : { color: headerTextColor })}
          >
            {t(tab.key)}
          </NavLink>
        ))}
        <Link
          to={helpPath}
          state={helpState}
          className={clsx('inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium', onHelpScreen ? 'bg-brand/10 text-brand-header' : 'hover:bg-black/5')}
          style={onHelpScreen ? undefined : { color: headerTextColor }}
          aria-label="Open help for this screen"
        >
          <CircleHelp size={17} />{t('help')}
        </Link>
      </nav>

      {/* Right: language + organisation selectors */}
      <div className="flex items-center gap-2">
        <Link to={helpPath} state={helpState} className="rounded-md p-2 hover:bg-black/5 md:hidden" style={{ color: headerTextColor }} aria-label="Open help for this screen" title="Help"><CircleHelp size={19} /></Link>
        <button type="button" onClick={onOpenThemeCustomizer} className="rounded-md p-2 hover:bg-black/5" style={{ color: headerTextColor }} aria-label="Customize theme" title="Customize theme">
          <Palette size={19} />
        </button>
        <LanguageSelector />
        <OrgSelector />
      </div>
    </header>
  );
}
