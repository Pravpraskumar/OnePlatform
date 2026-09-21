import { Controller, Get, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from './public.decorator';
import { OidcAuthService } from './oidc-auth.service';

@Controller('auth/oidc')
export class OidcAuthController {
  constructor(private readonly oidc: OidcAuthService) {}

  @Public()
  @Get('config')
  config() {
    return this.oidc.getConfig();
  }

  @Public()
  @Get('start')
  async start(@Res() response: Response) {
    try {
      const { url, state } = await this.oidc.begin();
      response.setHeader('Set-Cookie', `oidc_state=${state}; HttpOnly; Path=/api/auth/oidc; SameSite=Lax; Max-Age=600`);
      response.redirect(url);
    } catch {
      response.redirect(`${this.oidc.getFrontendUrl()}/signin#oidc_error=configuration`);
    }
  }

  @Public()
  @Get('callback')
  async callback(@Req() request: Request, @Res() response: Response) {
    const code = typeof request.query.code === 'string' ? request.query.code : '';
    const state = typeof request.query.state === 'string' ? request.query.state : '';
    const cookieState = this.readCookie(request.headers.cookie, 'oidc_state');
    if (!state || state !== cookieState) {
      response.redirect(`${this.oidc.getFrontendUrl()}/signin#oidc_error=state`);
      return;
    }

    try {
      const result = await this.oidc.complete(code, state);
      response.setHeader('Set-Cookie', 'oidc_state=; HttpOnly; Path=/api/auth/oidc; SameSite=Lax; Max-Age=0');
      response.redirect(`${result.redirectUrl}#oidc_token=${encodeURIComponent(result.accessToken)}`);
    } catch {
      response.redirect(`${this.oidc.getFrontendUrl()}/signin#oidc_error=authentication`);
    }
  }

  private readCookie(header: string | undefined, name: string): string | undefined {
    const value = header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return value ? decodeURIComponent(value.slice(name.length + 1)) : undefined;
  }
}
