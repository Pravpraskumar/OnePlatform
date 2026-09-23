import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import type { OrganisationSummary } from '@platform/shared';
import { useMsal } from '@azure/msal-react';
import { useApi } from '@/lib/ApiProvider';
import { useSession } from '@/state/SessionProvider';

interface OrgContextValue {
  selectedOrg: OrganisationSummary | null;
  organisations: OrganisationSummary[];
  loading: boolean;
  error: string;
  setSelectedOrg: (org: OrganisationSummary | null) => void;
  reloadOrganisations: () => void;
}

const OrgContext = createContext<OrgContextValue | null>(null);
const STORAGE_KEY = 'selectedOrgId';

function storedOrganisation(): OrganisationSummary | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OrganisationSummary;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function OrgProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const { user } = useSession();
  const { accounts } = useMsal();
  const authenticatedUserId = user?.id ?? accounts[0]?.homeAccountId ?? null;
  const [selectedOrg, setSelectedOrgState] = useState<OrganisationSummary | null>(storedOrganisation);
  const [organisations, setOrganisations] = useState<OrganisationSummary[]>([]);
  const [loading, setLoading] = useState(!!authenticatedUserId);
  const [error, setError] = useState('');
  const [reloadVersion, setReloadVersion] = useState(0);
  const previousUserId = useRef(authenticatedUserId);

  useEffect(() => {
    const userId = authenticatedUserId;
    const isNewLogin = previousUserId.current !== userId && userId !== null;
    previousUserId.current = userId;

    if (!userId) {
      setOrganisations([]);
      setLoading(false);
      setError('');
      return;
    }

    if (isNewLogin) {
      setSelectedOrgState(null);
      localStorage.removeItem(STORAGE_KEY);
    }

    let cancelled = false;
    setLoading(true);
    setError('');
    api.get<OrganisationSummary[]>('/organisations/mine')
      .then((rows) => {
        if (cancelled) return;
        setOrganisations(rows);
        setSelectedOrgState((current) => {
          const validated = !isNewLogin && current
            ? rows.find((organisation) => organisation.id === current.id) ?? null
            : null;
          const next = rows.length === 1 ? rows[0] : validated;
          if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
          else localStorage.removeItem(STORAGE_KEY);
          return next;
        });
      })
      .catch(() => {
        if (cancelled) return;
        setOrganisations([]);
        setSelectedOrgState(null);
        localStorage.removeItem(STORAGE_KEY);
        setError('Organisation memberships could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, authenticatedUserId, reloadVersion]);

  const setSelectedOrg = useCallback((org: OrganisationSummary | null) => {
    setSelectedOrgState(org);
    if (org) localStorage.setItem(STORAGE_KEY, JSON.stringify(org));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  const reloadOrganisations = useCallback(() => setReloadVersion((version) => version + 1), []);
  const value = useMemo(
    () => ({ selectedOrg, organisations, loading, error, setSelectedOrg, reloadOrganisations }),
    [selectedOrg, organisations, loading, error, setSelectedOrg, reloadOrganisations],
  );

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within OrgProvider');
  return ctx;
}
