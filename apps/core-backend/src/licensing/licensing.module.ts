import { Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { SessionReaper } from './session-reaper';

@Module({
  controllers: [SessionsController],
  providers: [SessionsService, SessionReaper],
  exports: [SessionsService],
})
export class LicensingModule {}
