import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { Menu as MenuIcon, Palette } from 'lucide-react';
import { clsx } from 'clsx';
import { Logo } from './Logo';
import { LanguageSelector } from './LanguageSelector';
import { OrgSelector } from './OrgSelector';
import { UserMenu } from './UserMenu';
import { useTheme } from '@/state/ThemeProvider';

interface Props {
  onToggleSidebar: () => void;
  onOpenThemeCustomizer: () => void;
  moduleName: string | null;
}

const tabs = [
  { key: 'products', to: '/app/products' },
  { key: 'resources', to: '/app/resources' },
];

export function AppHeader({ onToggleSidebar, onOpenThemeCustomizer, moduleName }: Props) {
  const { t } = useTranslation();
  const { headerColor, headerTextColor } = useTheme();

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
        <Logo textColor={headerTextColor} />
        {moduleName && <span className="hidden text-sm font-medium sm:inline">/ {moduleName}</span>}
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
                isActive ? 'bg-brand/10 text-brand' : 'hover:bg-black/5',
              )
            }
            style={({ isActive }) => (isActive ? undefined : { color: headerTextColor })}
          >
            {t(tab.key)}
          </NavLink>
        ))}
      </nav>

      {/* Right: language + organisation selectors */}
      <div className="flex items-center gap-2">
        <LanguageSelector />
        <OrgSelector />
        <button
          type="button"
          onClick={onOpenThemeCustomizer}
          className="rounded-md p-2 hover:bg-black/5"
          style={{ color: headerTextColor }}
          aria-label="Customize theme"
          title="Customize theme"
        >
          <Palette size={18} />
        </button>
        <UserMenu />
      </div>
    </header>
  );
}
