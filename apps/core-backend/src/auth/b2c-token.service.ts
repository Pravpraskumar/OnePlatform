import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

export interface B2cClaims {
  oid?: string;
  sub: string;
  emails?: string[];
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  [key: string]: unknown;
}

// Verifies Azure AD B2C issued JWTs using the tenant JWKS endpoint.
@Injectable()
export class B2cTokenService {
  private readonly jwks: JwksClient;
  private readonly issuer: string;
  private readonly audience: string;

  constructor(private readonly config: ConfigService) {
    const tenant = this.config.getOrThrow<string>('B2C_TENANT_NAME');
    const policy = this.config.getOrThrow<string>('B2C_POLICY_NAME');
    this.audience = this.config.getOrThrow<string>('B2C_CLIENT_ID');

    const jwksUri =
      this.config.get<string>('B2C_JWKS_URI') ??
      `https://${tenant}.b2clogin.com/${tenant}.onmicrosoft.com/${policy}/discovery/v2.0/keys`;
    this.issuer =
      this.config.get<string>('B2C_ISSUER') ??
      `https://${tenant}.b2clogin.com/${tenant}.onmicrosoft.com/v2.0/`;

    this.jwks = new JwksClient({ jwksUri, cache: true, rateLimit: true });
  }

  async verify(token: string): Promise<B2cClaims> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
      throw new UnauthorizedException('Malformed token');
    }
    const key = await this.jwks.getSigningKey(decoded.header.kid);
    const publicKey = key.getPublicKey();

    try {
      return jwt.verify(token, publicKey, {
        algorithms: ['RS256'],
        audience: this.audience,
        issuer: this.issuer,
      }) as B2cClaims;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
