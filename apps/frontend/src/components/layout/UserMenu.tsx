import { useMsal } from '@azure/msal-react';
import { CircleUserRound, LogOut, MoreVertical, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { useSession } from '@/state/SessionProvider';
import { getLocalToken } from '@/state/localSession';
import { useOrg } from '@/state/OrgProvider';

// Shows the signed-in user and a sign-out action for local or B2C sessions.
export function UserMenu({ collapsed }: { collapsed: boolean }) {
  const { user, logout } = useSession();
  const { selectedOrg } = useOrg();
  const { instance } = useMsal();
  const navigate = useNavigate();

  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
  const name = user?.displayName ?? (account?.name || account?.username) ?? 'Account';
  const email = user?.email ?? account?.username ?? '';
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const isGlobalAdministrator = user?.globalRoles.includes('Global Administrator');
  const isOrganisationAdministrator = selectedOrg?.membership === 'Owner' || selectedOrg?.membership === 'Admin';
  const settingsRoute = isGlobalAdministrator && user
    ? `/admin/user-settings?userId=${encodeURIComponent(user.id)}`
    : isOrganisationAdministrator
      ? '/org/settings'
      : '/account/settings';

  const signOut = () => {
    const hadLocal = !!getLocalToken();
    logout();
    if (!hadLocal && account) {
      instance.logoutRedirect();
    } else {
      window.location.href = '/';
    }
  };

  return (
    <Dropdown
      align="left"
      side="right"
      triggerClassName="w-full"
      trigger={
        <span className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-slate-100" title={collapsed ? `${name}${email ? ` (${email})` : ''}` : undefined}>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-xs font-semibold text-brand">
            {initials || 'A'}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-800">{name}</span>
                {email && <span className="block truncate text-xs text-slate-500">{email}</span>}
              </span>
              <MoreVertical size={17} className="shrink-0 text-slate-500" />
            </>
          )}
        </span>
      }
    >
      <div className="flex items-center gap-3 border-b border-slate-200 px-3 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand/10 text-xs font-semibold text-brand">
          {initials || 'A'}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-900">{name}</span>
          {email && <span className="block truncate text-xs text-slate-500">{email}</span>}
        </span>
      </div>
      <DropdownItem onClick={() => navigate('/account/settings')}>
        <span className="flex items-center gap-2">
          <CircleUserRound size={15} className="text-slate-500" />
          Account
        </span>
      </DropdownItem>
      <DropdownItem onClick={() => navigate(settingsRoute)}>
        <span className="flex items-center gap-2">
          <Settings size={14} />
          Settings
        </span>
      </DropdownItem>
      <div className="mt-1 border-t border-slate-200 pt-1">
        <DropdownItem onClick={signOut}>
          <span className="flex items-center gap-2">
            <LogOut size={14} className="text-slate-500" />
            Logout
          </span>
        </DropdownItem>
      </div>
    </Dropdown>
  );
}
