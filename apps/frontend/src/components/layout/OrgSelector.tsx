import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronDown } from 'lucide-react';
import type { OrganisationSummary } from '@platform/shared';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { useTheme } from '@/state/ThemeProvider';

// Header org selector: shows the active org or "Select Organisation",
// with actions Switch / Org-Settings / Org-Teams / Org Administrator.
export function OrgSelector() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { selectedOrg, setSelectedOrg } = useOrg();
  const { headerTextColor } = useTheme();
  const [orgs, setOrgs] = useState<OrganisationSummary[]>([]);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    api
      .get<OrganisationSummary[]>('/organisations/mine')
      .then(setOrgs)
      .catch(() => setOrgs([]));
  }, [api]);

  const label = selectedOrg?.name ?? t('selectOrganisation');

  return (
    <Dropdown
      trigger={
        <span
          className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-black/5"
          style={{ color: headerTextColor, borderColor: headerTextColor }}
        >
          <Building2 size={16} />
          <span className="max-w-32 truncate">{label}</span>
          <ChevronDown size={14} />
        </span>
      }
    >
      {switching ? (
        <>
          {orgs.length === 0 && (
            <div className="px-4 py-2 text-sm text-slate-400">No organisations</div>
          )}
          {orgs.map((o) => (
            <DropdownItem
              key={o.id}
              onClick={() => {
                setSelectedOrg(o);
                setSwitching(false);
              }}
            >
              {o.name}
            </DropdownItem>
          ))}
        </>
      ) : (
        <>
          <DropdownItem onClick={() => setSwitching(true)}>{t('switch')}</DropdownItem>
          <DropdownItem onClick={() => navigate('/org/settings')}>{t('orgSettings')}</DropdownItem>
          <DropdownItem onClick={() => navigate('/org/teams')}>{t('orgTeams')}</DropdownItem>
          <DropdownItem onClick={() => navigate('/org/admin')}>{t('orgAdministrator')}</DropdownItem>
        </>
      )}
    </Dropdown>
  );
}
