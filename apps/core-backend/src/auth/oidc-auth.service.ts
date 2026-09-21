import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';
import { LocalAuthService } from './local-auth.service';
import { UserProvisioningService } from './user-provisioning.service';
import type { B2cClaims } from './b2c-token.service';

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  issuer: string;
  jwks_uri: string;
}

interface OidcTokenResponse {
  id_token?: string;
  access_token?: string;
  token_type?: string;
}

@Injectable()
export class OidcAuthService {
  private readonly wellKnown?: string;
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly providerLabel: string;
  private readonly callbackUrl: string;
  private readonly frontendUrl: string;
  private readonly skipVerify: boolean;
  private discovery?: OidcDiscovery;
  private readonly states = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly provisioning: UserProvisioningService,
    private readonly localAuth: LocalAuthService,
  ) {
    this.wellKnown = this.config.get<string>('OIDC_WELL_KNOWN');
    this.clientId = this.config.get<string>('OIDC_CLIENT_ID');
    this.clientSecret = this.config.get<string>('OIDC_CLIENT_SECRET');
    this.providerLabel = this.config.get<string>('OIDC_PROVIDER_LABEL') ?? 'Continue with OIDC';
    this.callbackUrl = this.config.get<string>('OIDC_CALLBACK_URL') ?? 'http://localhost:4000/api/auth/oidc/callback';
    this.frontendUrl = this.config.get<string>('OIDC_FRONTEND_URL') ?? (this.config.get<string>('CORS_ORIGIN')?.split(',')[0] ?? 'http://localhost:5173');
    const requestedSkipVerify = this.config.get<string>('OIDC_SKIP_VERIFY') === 'true';
    this.skipVerify = requestedSkipVerify && this.config.get<string>('NODE_ENV') !== 'production';
  }

  isConfigured(): boolean {
    return !!(this.wellKnown && this.clientId && this.clientSecret);
  }

  getConfig() {
    return { enabled: this.isConfigured(), providerLabel: this.providerLabel };
  }

  getFrontendUrl(): string {
    return this.frontendUrl.replace(/\/$/, '');
  }

  async begin(stateCookieValue?: string): Promise<{ url: string; state: string }> {
    this.requireConfigured();
    const discovery = await this.getDiscovery();
    const state = crypto.randomBytes(32).toString('hex');
    this.states.set(state, Date.now() + 10 * 60 * 1000);
    if (stateCookieValue && stateCookieValue !== state) throw new UnauthorizedException('Invalid OIDC state');
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.clientId!);
    url.searchParams.set('redirect_uri', this.callbackUrl);
    url.searchParams.set('scope', 'openid profile email');
    url.searchParams.set('state', state);
    return { url: url.toString(), state };
  }

  async complete(code: string, state: string): Promise<{ accessToken: string; redirectUrl: string }> {
    this.requireConfigured();
    const expiresAt = this.states.get(state);
    this.states.delete(state);
    if (!expiresAt || expiresAt < Date.now()) throw new UnauthorizedException('Invalid or expired OIDC state');

    const discovery = await this.getDiscovery();
    const response = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        redirect_uri: this.callbackUrl,
      }),
    });
    if (!response.ok) throw new UnauthorizedException('OIDC token exchange failed');
    const tokens = (await response.json()) as OidcTokenResponse;
    if (!tokens.id_token) throw new UnauthorizedException('OIDC provider did not return an ID token');

    const claims = await this.verifyIdToken(tokens.id_token, discovery);
    const email = this.claimString(claims, 'email') ?? this.claimString(claims, 'preferred_username');
    const subject = this.claimString(claims, 'sub');
    if (!email || !subject) throw new UnauthorizedException('OIDC identity has no email or subject');

    const authUser = await this.provisioning.resolve({
      sub: subject,
      oid: `oidc:${subject}`,
      email,
      name: this.claimString(claims, 'name') ?? email,
      given_name: this.claimString(claims, 'given_name'),
      family_name: this.claimString(claims, 'family_name'),
    });
    const result = await this.localAuth.issueForUser(authUser.id);
    return { accessToken: result.accessToken, redirectUrl: `${this.getFrontendUrl()}/signin` };
  }

  private requireConfigured(): void {
    if (!this.isConfigured()) throw new UnauthorizedException('OIDC login is not configured');
  }

  private async getDiscovery(): Promise<OidcDiscovery> {
    if (this.discovery) return this.discovery;
    const response = await fetch(this.wellKnown!);
    if (!response.ok) throw new UnauthorizedException('OIDC discovery failed');
    const discovery = (await response.json()) as OidcDiscovery;
    if (!discovery.authorization_endpoint || !discovery.token_endpoint || !discovery.issuer || !discovery.jwks_uri) {
      throw new UnauthorizedException('OIDC discovery metadata is incomplete');
    }
    this.discovery = discovery;
    return discovery;
  }

  private async verifyIdToken(token: string, discovery: OidcDiscovery): Promise<Record<string, unknown>> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid || !decoded.payload || typeof decoded.payload === 'string') {
      throw new UnauthorizedException('Malformed OIDC ID token');
    }
    if (this.skipVerify) return decoded.payload as Record<string, unknown>;

    const jwks = new JwksClient({ jwksUri: discovery.jwks_uri, cache: true, rateLimit: true });
    const key = await jwks.getSigningKey(decoded.header.kid);
    try {
      return jwt.verify(token, key.getPublicKey(), {
        algorithms: ['RS256'],
        audience: this.clientId,
        issuer: discovery.issuer,
      }) as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('Invalid OIDC ID token');
    }
  }

  private claimString(claims: Record<string, unknown>, name: string): string | undefined {
    const value = claims[name];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }
}
