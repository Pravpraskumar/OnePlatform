import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useIsAuthenticated } from '@azure/msal-react';
import { useApi } from '@/lib/ApiProvider';
import { useSession } from '@/state/SessionProvider';

export interface ThemeState {
  headerColor: string;
  headerTextColor: string;
  banner: {
    enabled: boolean;
    bgColor: string;
    textColor: string;
    content: string | null;
  };
}

export interface UserThemePreferences {
  mode: 'light' | 'dark';
  preset: 'slate' | 'ocean' | 'forest' | 'rose';
  radius: number;
  brandColor: string;
}

export const DEFAULT_USER_THEME: UserThemePreferences = {
  mode: 'light',
  preset: 'slate',
  radius: 6,
  brandColor: '#2563eb',
};

interface ThemeContextValue extends ThemeState {
  userTheme: UserThemePreferences;
  themeLoading: boolean;
  updateUserTheme: (preferences: UserThemePreferences) => Promise<void>;
  resetUserTheme: () => Promise<void>;
  refresh: () => Promise<void>;
}

const DEFAULTS: ThemeState = {
  headerColor: '#ffffff',
  headerTextColor: '#0f172a',
  banner: { enabled: false, bgColor: '#1e3a8a', textColor: '#ffffff', content: null },
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface BannerResponse {
  enabled: boolean;
  bgColor: string;
  textColor: string;
  content: string | null;
  headerColor?: string;
  headerTextColor?: string;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const { isLocalAuthenticated, user } = useSession();
  const isB2cAuthenticated = useIsAuthenticated();
  const [state, setState] = useState<ThemeState>(DEFAULTS);
  const [userTheme, setUserTheme] = useState<UserThemePreferences>(DEFAULT_USER_THEME);
  const [themeLoading, setThemeLoading] = useState(false);
  const isAuthenticated = isLocalAuthenticated || isB2cAuthenticated;

  const refresh = useCallback(async () => {
    if (!isAuthenticated) {
      setState(DEFAULTS);
      setUserTheme(DEFAULT_USER_THEME);
      return;
    }

    try {
      const s = await api.get<BannerResponse>('/settings/banner');
      setState({
        headerColor: s.headerColor ?? DEFAULTS.headerColor,
        headerTextColor: s.headerTextColor ?? DEFAULTS.headerTextColor,
        banner: { enabled: s.enabled, bgColor: s.bgColor, textColor: s.textColor, content: s.content },
      });
    } catch {
      setState(DEFAULTS);
    }

    setThemeLoading(true);
    try {
      setUserTheme(await api.get<UserThemePreferences>('/account/theme'));
    } catch {
      setUserTheme(DEFAULT_USER_THEME);
    } finally {
      setThemeLoading(false);
    }
  }, [api, isAuthenticated]);

  const updateUserTheme = useCallback(async (preferences: UserThemePreferences) => {
    const updated = await api.put<UserThemePreferences>('/account/theme', preferences);
    setUserTheme(updated);
  }, [api]);

  const resetUserTheme = useCallback(async () => {
    const updated = await api.put<UserThemePreferences>('/account/theme', DEFAULT_USER_THEME);
    setUserTheme(updated);
  }, [api]);

  // Re-fetch on mount and whenever the user becomes authenticated.
  useEffect(() => {
    void refresh();
  }, [refresh, isLocalAuthenticated, isB2cAuthenticated, user?.id]);

  const value = useMemo<ThemeContextValue>(() => ({
    ...state,
    userTheme,
    themeLoading,
    updateUserTheme,
    resetUserTheme,
    refresh,
  }), [state, userTheme, themeLoading, updateUserTheme, resetUserTheme, refresh]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
