import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { B2cTokenService } from './b2c-token.service';
import { LocalTokenService } from './local-token.service';
import { UserProvisioningService } from './user-provisioning.service';
import { IS_PUBLIC_KEY } from './public.decorator';

// Accepts either a platform-local JWT or an Azure AD B2C token.
@Injectable()
export class B2cAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: B2cTokenService,
    private readonly localTokens: LocalTokenService,
    private readonly provisioning: UserProvisioningService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = header.slice('Bearer '.length);

    if (this.localTokens.looksLocal(token)) {
      const payload = this.localTokens.verify(token);
      req.user = await this.provisioning.resolveById(payload.sub);
      return true;
    }

    const claims = await this.tokens.verify(token);
    req.user = await this.provisioning.resolve(claims);
    return true;
  }
}
