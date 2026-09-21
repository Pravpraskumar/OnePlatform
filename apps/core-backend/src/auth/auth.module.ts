import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from '../users/users.module';
import { B2cTokenService } from './b2c-token.service';
import { LocalTokenService } from './local-token.service';
import { UserProvisioningService } from './user-provisioning.service';
import { LocalAuthService } from './local-auth.service';
import { B2cAuthGuard } from './b2c-auth.guard';
import { RolesGuard } from './roles.guard';
import { AuthController } from './auth.controller';
import { LocalAuthController } from './local-auth.controller';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { OidcAuthService } from './oidc-auth.service';
import { OidcAuthController } from './oidc-auth.controller';

@Module({
  imports: [UsersModule],
  controllers: [AuthController, LocalAuthController, AccountController, OidcAuthController],
  providers: [
    B2cTokenService,
    LocalTokenService,
    UserProvisioningService,
    LocalAuthService,
    AccountService,
    OidcAuthService,
    // Global auth: every route requires a valid token unless marked @Public().
    { provide: APP_GUARD, useClass: B2cAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [B2cTokenService, LocalTokenService, UserProvisioningService],
})
export class AuthModule {}
