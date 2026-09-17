import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ProductAuthUser {
  id: string;
  email: string;
  displayName: string;
  globalRoles: string[];
  organisations: Array<{ id: string; membership?: 'Owner' | 'Admin' | 'Member' }>;
}

export interface ProductAuthenticatedRequest {
  headers: { authorization?: string };
  user?: ProductAuthUser;
}

@Injectable()
export class ProductAuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<ProductAuthenticatedRequest>();
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Missing bearer token');

    const coreApiUrl = (this.config.get<string>('CORE_API_URL') ?? 'http://localhost:4000/api').replace(/\/$/, '');
    const headers = { Authorization: authorization };
    const [userResponse, organisationsResponse] = await Promise.all([
      fetch(`${coreApiUrl}/auth/me`, { headers }),
      fetch(`${coreApiUrl}/organisations/mine`, { headers }),
    ]);
    if (!userResponse.ok || !organisationsResponse.ok) throw new UnauthorizedException('Invalid bearer token');

    const user = await userResponse.json() as Omit<ProductAuthUser, 'organisations'>;
    const organisations = await organisationsResponse.json() as ProductAuthUser['organisations'];
    request.user = { ...user, organisations };
    return true;
  }
}