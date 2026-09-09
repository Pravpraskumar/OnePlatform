import { Body, Controller, Delete, Get, Patch, Put } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import type { AuthUser } from './auth-user.interface';
import { AccountService } from './account.service';
import { ChangePasswordDto, DeleteAccountDto, UpdateAccountProfileDto, UpdateThemePreferencesDto } from './dto/account.dto';

@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get()
  profile(@CurrentUser() user: AuthUser) {
    return this.account.getProfile(user.id);
  }

  @Patch()
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateAccountProfileDto) {
    return this.account.updateProfile(user, dto);
  }

  @Get('theme')
  theme(@CurrentUser() user: AuthUser) {
    return this.account.getThemePreferences(user.id);
  }

  @Put('theme')
  updateTheme(@CurrentUser() user: AuthUser, @Body() dto: UpdateThemePreferencesDto) {
    return this.account.updateThemePreferences(user.id, dto);
  }

  @Put('password')
  changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    return this.account.changePassword(user.id, dto.currentPassword, dto.newPassword);
  }

  @Delete()
  deleteAccount(@CurrentUser() user: AuthUser, @Body() dto: DeleteAccountDto) {
    return this.account.deleteAccount(user.id, dto.currentPassword);
  }
}