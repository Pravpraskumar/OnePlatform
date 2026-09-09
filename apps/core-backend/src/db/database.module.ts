import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { createDb, createPool, CoreDb } from './index';

export const CORE_DB = 'CORE_DB';
export const CORE_POOL = 'CORE_POOL';

@Global()
@Module({
  providers: [
    {
      provide: CORE_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Pool => {
        const url = config.getOrThrow<string>('CORE_DATABASE_URL');
        return createPool(url);
      },
    },
    {
      provide: CORE_DB,
      inject: [CORE_POOL],
      useFactory: (pool: Pool): CoreDb => createDb(pool),
    },
  ],
  exports: [CORE_DB, CORE_POOL],
})
export class DatabaseModule {}
