import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SessionsService } from './sessions.service';

@Injectable()
export class SessionReaper {
  private readonly logger = new Logger(SessionReaper.name);

  constructor(private readonly sessions: SessionsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handle() {
    const closed = await this.sessions.reapIdleSessions();
    if (closed > 0) this.logger.log(`Reaped ${closed} idle session(s)`);
  }
}
