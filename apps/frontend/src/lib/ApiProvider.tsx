import { createContext, useContext, useMemo, ReactNode } from 'react';
import { useMsal } from '@azure/msal-react';
import { createApiClient, ApiClient } from './apiClient';

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
  const { instance } = useMsal();
  const client = useMemo(() => createApiClient(instance), [instance]);
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const ctx = useContext(ApiContext);
  if (!ctx) throw new Error('useApi must be used within ApiProvider');
  return ctx;
}
