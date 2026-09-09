import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { OrganisationSummary } from '@platform/shared';

interface OrgContextValue {
  selectedOrg: OrganisationSummary | null;
  setSelectedOrg: (org: OrganisationSummary | null) => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);
const STORAGE_KEY = 'selectedOrgId';

export function OrgProvider({ children }: { children: ReactNode }) {
  const [selectedOrg, setSelectedOrgState] = useState<OrganisationSummary | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setSelectedOrgState(JSON.parse(raw));
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  }, []);

  const setSelectedOrg = (org: OrganisationSummary | null) => {
    setSelectedOrgState(org);
    if (org) localStorage.setItem(STORAGE_KEY, JSON.stringify(org));
    else localStorage.removeItem(STORAGE_KEY);
  };

  return <OrgContext.Provider value={{ selectedOrg, setSelectedOrg }}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
