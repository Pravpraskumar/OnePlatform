import type { AuthUser } from '@platform/shared';

// LocalStorage-backed accessors for the platform email/password session.
const TOKEN_KEY = 'platformAuthToken';
const USER_KEY = 'platformAuthUser';

export function getLocalToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getLocalUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setLocalToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function setLocalSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function setLocalUser(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearLocalSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
