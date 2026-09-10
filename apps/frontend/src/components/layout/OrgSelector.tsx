import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, ChevronDown } from 'lucide-react';
import type { OrganisationSummary } from '@platform/shared';
import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
import { useApi } from '@/lib/ApiProvider';
import { useOrg } from '@/state/OrgProvider';
import { useTheme } from '@/state/ThemeProvider';

// Header organisation selector: membership list controlling the active session organisation.
export function OrgSelector() {
  const { t } = useTranslation();
  const api = useApi();
  const { selectedOrg, setSelectedOrg } = useOrg();
  const { headerTextColor } = useTheme();
  const [orgs, setOrgs] = useState<OrganisationSummary[]>([]);

  useEffect(() => {
    api
      .get<OrganisationSummary[]>('/organisations/mine')
      .then((rows) => {
        setOrgs(rows);
        if (selectedOrg) {
          const current = rows.find((organisation) => organisation.id === selectedOrg.id);
          setSelectedOrg(current ?? null);
        }
      })
      .catch(() => setOrgs([]));
  }, [api]);

  const label = selectedOrg?.name ?? t('selectOrganisation');
  const availableOrgs = orgs.filter((organisation) => organisation.id !== selectedOrg?.id);

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
      {availableOrgs.length === 0 && (
        <div className="px-4 py-2 text-sm text-slate-400">
          {selectedOrg ? 'No other organisations' : 'No organisation memberships'}
        </div>
      )}
      {availableOrgs.map((organisation) => (
        <DropdownItem key={organisation.id} onClick={() => setSelectedOrg(organisation)}>
          {organisation.name}
        </DropdownItem>
      ))}
    </Dropdown>
  );
}
