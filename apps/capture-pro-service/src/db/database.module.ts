import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDb, createPool, type CaptureProDb } from './index';

export const CAPTURE_PRO_DB = 'CAPTURE_PRO_DB';

@Global()
@Module({
  providers: [{
    provide: CAPTURE_PRO_DB,
    inject: [ConfigService],
    useFactory: (config: ConfigService): CaptureProDb => createDb(createPool(config.getOrThrow<string>('CAPTUREPRO_DATABASE_URL'))),
  }],
  exports: [CAPTURE_PRO_DB],
})
export class DatabaseModule {}