import { Body, Controller, Get, Put } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto, UpdateSmtpSettingsDto } from './dto/settings.dto';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user.interface';
import { Roles } from '../auth/roles.decorator';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @Roles('Global Administrator')
  get() {
    return this.settings.get();
  }

  // Banner is shown to every authenticated user at the top of the app.
  @Get('banner')
  banner() {
    return this.settings.getBanner();
  }

  @Put()
  @Roles('Global Administrator')
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthUser) {
    return this.settings.update(dto, user.id);
  }

  @Get('smtp')
  @Roles('Global Administrator')
  smtp() {
    return this.settings.getSmtpConfigurations();
  }

  @Put('smtp')
  @Roles('Global Administrator')
  updateSmtp(@Body() dto: UpdateSmtpSettingsDto, @CurrentUser() user: AuthUser) {
    return this.settings.updateSmtpConfigurations(dto.configurations, user.id);
  }
}
