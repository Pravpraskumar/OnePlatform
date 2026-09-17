import { useCallback, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import * as Icons from 'lucide-react';
import { clsx } from 'clsx';
import type { MenuNode } from '@platform/shared';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { UserMenu } from './UserMenu';

interface Props {
  collapsed: boolean;
}

function renderIcon(name: string | null) {
  if (!name) return <Icons.Circle size={18} />;
  const key = name
    .split('-')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  const Icon = (Icons as Record<string, unknown>)[key] as React.ComponentType<{ size?: number }>;
  return Icon ? <Icon size={18} /> : <Icons.Circle size={18} />;
}

function MenuItem({ node, collapsed, depth }: { node: MenuNode; collapsed: boolean; depth: number }) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;

  const content = (
    <span className="flex items-center gap-3">
      {renderIcon(node.icon)}
      {!collapsed && <span className="truncate">{node.name}</span>}
    </span>
  );

  return (
    <div>
      {node.route ? (
        <NavLink
          to={node.route}
          end={node.route === '/app/product/CreditGuard'}
          className={({ isActive }) =>
            clsx(
              'flex items-center rounded-md px-3 py-2 text-sm transition',
              isActive ? 'bg-brand/10 text-brand' : 'text-slate-600 hover:bg-slate-100',
            )
          }
          style={{ paddingLeft: collapsed ? undefined : 12 + depth * 12 }}
        >
          {content}
        </NavLink>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          style={{ paddingLeft: collapsed ? undefined : 12 + depth * 12 }}
        >
          {content}
          {!collapsed && hasChildren && (
            <Icons.ChevronDown size={14} className={clsx('transition', open ? '' : '-rotate-90')} />
          )}
        </button>
      )}
      {hasChildren && open && (
        <div className="mt-1 space-y-1">
          {node.children.map((child) => (
            <MenuItem key={child.id} node={child} collapsed={collapsed} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function AppSidebar({ collapsed }: Props) {
  const api = useApi();
  const { selectedOrg } = useOrg();
  const location = useLocation();
  const navigate = useNavigate();
  const [menus, setMenus] = useState<MenuNode[]>([]);

  const loadMenus = useCallback(() => {
    const query = selectedOrg ? `?orgId=${encodeURIComponent(selectedOrg.id)}` : '';
    api
      .get<MenuNode[]>(`/menus/mine${query}`)
      .then(setMenus)
      .catch(() => setMenus([]));
  }, [api, selectedOrg]);

  useEffect(() => {
    loadMenus();
  }, [loadMenus, location.pathname]);

  useEffect(() => {
    window.addEventListener('focus', loadMenus);
    return () => window.removeEventListener('focus', loadMenus);
  }, [loadMenus]);

  const hasGlobalUsers = (nodes: MenuNode[]): boolean =>
    nodes.some((node) => node.route === '/admin/users' || hasGlobalUsers(node.children));

  const isOrganisationAdmin =
    selectedOrg?.membership === 'Owner' || selectedOrg?.membership === 'Admin';
  const canManageOrganisation = isOrganisationAdmin || hasGlobalUsers(menus);
  let visibleMenus = menus;
  if (selectedOrg && !canManageOrganisation) {
    const hideOrganisationAdminMenus = (nodes: MenuNode[]): MenuNode[] =>
      nodes
        .filter((node) => !['/admin/sessions', '/org/members'].includes(node.route ?? ''))
        .map((node) => ({ ...node, children: hideOrganisationAdminMenus(node.children) }));
    visibleMenus = hideOrganisationAdminMenus(visibleMenus);
  }
  if (selectedOrg && selectedOrg.slug !== 'global') {
    const globalOnlyRoutes = ['/admin/users', '/admin/user-assignments', '/admin/user-settings', '/admin/projects', '/admin/settings'];
    const hideGlobalMenus = (nodes: MenuNode[]): MenuNode[] =>
      nodes
        .filter((node) => !globalOnlyRoutes.includes(node.route ?? ''))
        .map((node) => ({ ...node, children: hideGlobalMenus(node.children) }));
    visibleMenus = hideGlobalMenus(visibleMenus);
  }

  useEffect(() => {
    if (!selectedOrg) return;
    if (
      selectedOrg.slug !== 'global' &&
      ['/admin/users', '/admin/user-assignments', '/admin/user-settings', '/admin/projects', '/admin/settings'].includes(location.pathname)
    ) {
      navigate('/org/members', { replace: true });
    }
  }, [location.pathname, menus, navigate, selectedOrg]);

  return (
    <aside
      className={clsx(
        'hidden h-full flex-col border-r border-slate-200 bg-white transition-all duration-200 md:flex',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visibleMenus.map((node) => (
          <MenuItem key={node.id} node={node} collapsed={collapsed} depth={0} />
        ))}
      </nav>
      <div className="shrink-0 border-t border-slate-200 p-3">
        <UserMenu collapsed={collapsed} />
      </div>
    </aside>
  );
}
