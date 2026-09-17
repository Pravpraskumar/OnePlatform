import { Global, Module } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { SettingsController } from './settings.controller';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

// Global so UsersService and SessionsService can read settings without cycles.
@Global()
@Module({
  controllers: [SettingsController, NotificationsController],
  providers: [SettingsService, NotificationsService],
  exports: [SettingsService, NotificationsService],
})
export class SettingsModule {}
