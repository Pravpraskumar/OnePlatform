import { BrowserCacheLocation, PublicClientApplication, type AuthenticationResult } from '@azure/msal-browser';

export interface SharePointConfiguration {
  enabled: boolean;
  tenantId: string;
  clientId: string;
  organisationId: string;
}

const scopes = ['https://graph.microsoft.com/Sites.Selected'];
const pendingKey = 'captureProSharePointSignIn';
const integrationPath = '/app/product/Capture-Pro/integrations';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const placeholderId = '00000000-0000-0000-0000-000000000000';

export function isSharePointConfigured(configuration: SharePointConfiguration, organisationId: string): boolean {
  return configuration.enabled
    && uuid.test(configuration.tenantId) && configuration.tenantId !== placeholderId
    && uuid.test(configuration.clientId) && configuration.clientId !== placeholderId
    && configuration.organisationId === organisationId
    && !!organisationId;
}

export class SharePointConnection {
  private readonly client: PublicClientApplication;
  private readonly initialized: Promise<void>;
  private connected = false;

  constructor(private readonly configuration: SharePointConfiguration, private readonly organisationId: string, private readonly productId: string) {
    if (!isSharePointConfigured(configuration, organisationId) || !window.isSecureContext || !window.crypto?.subtle) {
      throw new Error('SharePoint sign-in is not configured for this organisation and secure browser context.');
    }
    this.client = new PublicClientApplication({
      auth: {
        clientId: configuration.clientId,
        authority: `https://login.microsoftonline.com/${configuration.tenantId}`,
        redirectUri: `${window.location.origin}${integrationPath}`,
        navigateToLoginRequestUrl: false,
      },
      cache: {
        cacheLocation: BrowserCacheLocation.MemoryStorage,
        temporaryCacheLocation: BrowserCacheLocation.SessionStorage,
        storeAuthStateInCookie: false,
      },
      system: { loggerOptions: { loggerCallback: () => undefined, piiLoggingEnabled: false } },
    });
    this.initialized = this.client.initialize();
  }

  private accept(result: AuthenticationResult): void {
    if (result.tenantId.toLowerCase() !== this.configuration.tenantId.toLowerCase() || !result.account || !result.accessToken) {
      throw new Error('Microsoft did not return an account and Graph token for the configured tenant.');
    }
    this.client.setActiveAccount(result.account);
    this.connected = true;
  }

  async resume(): Promise<boolean> {
    await this.initialized;
    const stored = sessionStorage.getItem(pendingKey);
    if (!stored) return false;
    let pending: unknown;
    try { pending = JSON.parse(stored); } catch { sessionStorage.removeItem(pendingKey); return false; }
    if (typeof pending !== 'object' || pending === null
      || !('organisationId' in pending) || pending.organisationId !== this.organisationId
      || !('productId' in pending) || pending.productId !== this.productId
      || !('expiresAt' in pending) || typeof pending.expiresAt !== 'number' || pending.expiresAt <= Date.now()) {
      sessionStorage.removeItem(pendingKey);
      await this.client.clearCache();
      throw new Error('The SharePoint sign-in context changed or expired. Connect again for the selected organisation.');
    }
    try {
      const result = await this.client.handleRedirectPromise();
      if (!result) return false;
      this.accept(result);
      return true;
    } finally {
      sessionStorage.removeItem(pendingKey);
    }
  }

  async connect(): Promise<void> {
    await this.initialized;
    sessionStorage.setItem(pendingKey, JSON.stringify({ organisationId: this.organisationId, productId: this.productId, expiresAt: Date.now() + 15 * 60 * 1000 }));
    try {
      await this.client.loginRedirect({ scopes, prompt: 'select_account' });
    } catch {
      sessionStorage.removeItem(pendingKey);
      throw new Error('Microsoft sign-in could not start. Check the approved app registration and redirect URI.');
    }
  }

  async getAccessToken(): Promise<string> {
    await this.initialized;
    const account = this.client.getActiveAccount();
    if (!this.connected || !account) throw new Error('Connect SharePoint before accessing the folder.');
    try {
      const result = await this.client.acquireTokenSilent({ account, scopes });
      this.accept(result);
      return result.accessToken;
    } catch {
      this.connected = false;
      throw new Error('Microsoft consent or sign-in is required. Disconnect and connect SharePoint again.');
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    sessionStorage.removeItem(pendingKey);
    await this.initialized;
    await this.client.clearCache();
  }
}