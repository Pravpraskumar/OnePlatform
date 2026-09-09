import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { AuthUser } from './auth-user.interface';

@Controller('auth')
export class AuthController {
  // Returns the resolved (JIT-provisioned) profile for the bearer token.
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
