import { useMsal } from '@azure/msal-react';
import { useTranslation } from 'react-i18next';
import { LogOut, User } from 'lucide-react';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { useSession } from '@/state/SessionProvider';
import { getLocalToken } from '@/state/localSession';
import { useTheme } from '@/state/ThemeProvider';

interface Props {
  collapsed?: boolean;
}

// Shows the signed-in user and a sign-out action for local or B2C sessions.
export function UserMenu({ collapsed = false }: Props) {
  const { t } = useTranslation();
  const { user, logout } = useSession();
  const { instance } = useMsal();
  const { headerTextColor } = useTheme();

  const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
  const name = user?.displayName ?? (account?.name || account?.username) ?? 'Account';

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
      trigger={
        <span
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-black/5"
          style={{ color: headerTextColor }}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/10">
            <User size={16} />
          </span>
          {!collapsed && <span className="hidden max-w-28 truncate lg:inline">{name}</span>}
        </span>
      }
    >
      <DropdownItem onClick={signOut}>
        <span className="flex items-center gap-2">
          <LogOut size={14} />
          {t('signOut')}
        </span>
      </DropdownItem>
    </Dropdown>
  );
}
