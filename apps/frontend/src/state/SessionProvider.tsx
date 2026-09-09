import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import type { AuthUser } from '@platform/shared';
import { useApi } from '@/lib/ApiProvider';
import { clearLocalSession, getLocalToken, getLocalUser, setLocalSession, setLocalUser } from './localSession';
import { notifySessionExpired } from '@/lib/systemEvents';

interface AuthResult {
  accessToken: string;
  user: AuthUser;
}

interface SessionContextValue {
  user: AuthUser | null;
  isLocalAuthenticated: boolean;
  register: (input: { email: string; password: string; displayName: string }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => void;
  updateUser: (input: Pick<AuthUser, 'displayName' | 'email'>) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [user, setUser] = useState<AuthUser | null>(() => getLocalUser());

  useEffect(() => {
    const token = getLocalToken();
    if (!token || !user) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
      if (!payload.exp) return;
      const remaining = payload.exp * 1000 - Date.now();
      if (remaining <= 0) {
        notifySessionExpired();
        return;
      }
      const timer = window.setTimeout(notifySessionExpired, remaining);
      return () => window.clearTimeout(timer);
    } catch {
      return;
    }
  }, [user]);

  const apply = useCallback((result: AuthResult) => {
    setLocalSession(result.accessToken, result.user);
    setUser(result.user);
  }, []);

  const register = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      apply(await api.post<AuthResult>('/auth/register', input));
    },
    [api, apply],
  );

  const login = useCallback(
    async (input: { email: string; password: string }) => {
      apply(await api.post<AuthResult>('/auth/login', input));
    },
    [api, apply],
  );

  const logout = useCallback(() => {
    clearLocalSession();
    setUser(null);
  }, []);

  const updateUser = useCallback((input: Pick<AuthUser, 'displayName' | 'email'>) => {
    setUser((current) => {
      if (!current) return current;
      const updated = { ...current, ...input };
      setLocalUser(updated);
      return updated;
    });
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({ user, isLocalAuthenticated: !!getLocalToken(), register, login, logout, updateUser }),
    [user, register, login, logout, updateUser],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
