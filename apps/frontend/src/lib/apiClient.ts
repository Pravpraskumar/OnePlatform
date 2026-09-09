import { IPublicClientApplication } from '@azure/msal-browser';
import { apiTokenRequest } from '@/auth/msalConfig';
import { getLocalToken } from '@/state/localSession';
import { notify, notifySessionExpired } from './systemEvents';

const API_BASE = (import.meta.env.VITE_API_BASE as string) ?? '/api';
let sessionExpiryReported = false;

// Prefers a platform-local session token, falling back to Azure AD B2C.
async function getToken(msal: IPublicClientApplication): Promise<string | null> {
  const local = getLocalToken();
  if (local) return local;

  const account = msal.getActiveAccount() ?? msal.getAllAccounts()[0];
  if (!account) return null;
  try {
    const result = await msal.acquireTokenSilent({ ...apiTokenRequest, account });
    return result.accessToken;
  } catch {
    const result = await msal.acquireTokenPopup(apiTokenRequest);
    return result.accessToken;
  }
}

export function createApiClient(msal: IPublicClientApplication) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken(msal);
    const headers = new Headers(init.headers);
    headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    if (!res.ok) {
      const body = await res.text();
      if (sessionExpiryReported) {
        throw new Error(`API ${res.status}: ${body}`);
      }
      if (res.status === 401 && token) {
        if (!sessionExpiryReported) {
          sessionExpiryReported = true;
          notifySessionExpired();
        }
      } else if (token) {
        notify('The requested operation could not be completed.', 'error');
      }
      throw new Error(`API ${res.status}: ${body}`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  return {
    get: <T>(path: string) => request<T>(path),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
    put: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
    patch: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
    del: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
