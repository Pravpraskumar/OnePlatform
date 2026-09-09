import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';

export interface LocalTokenPayload {
  sub: string;
  email: string;
  // Distinguishes locally-issued tokens from Azure AD B2C tokens.
  typ: 'local';
}

// Issues and verifies platform-local JWTs for email/password sessions.
@Injectable()
export class LocalTokenService {
  private readonly secret: string;
  private readonly expiresIn: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('LOCAL_JWT_SECRET');
    this.expiresIn = config.get<string>('LOCAL_JWT_EXPIRES_IN') ?? '12h';
  }

  sign(payload: Omit<LocalTokenPayload, 'typ'>): string {
    return jwt.sign({ ...payload, typ: 'local' }, this.secret, {
      expiresIn: this.expiresIn,
    } as jwt.SignOptions);
  }

  verify(token: string): LocalTokenPayload {
    try {
      const decoded = jwt.verify(token, this.secret) as LocalTokenPayload;
      if (decoded.typ !== 'local') throw new Error('not a local token');
      return decoded;
    } catch {
      throw new UnauthorizedException('Invalid local token');
    }
  }

  // Cheap check to route a bearer token to the local verifier before B2C.
  looksLocal(token: string): boolean {
    const decoded = jwt.decode(token) as Record<string, unknown> | null;
    return !!decoded && decoded.typ === 'local';
  }
}
