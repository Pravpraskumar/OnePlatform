import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { createDb, createPool, ProductDb } from './index';

export const PRODUCT_DB = 'PRODUCT_DB';

@Global()
@Module({
  providers: [
    {
      provide: PRODUCT_DB,
      inject: [ConfigService],
      useFactory: (config: ConfigService): ProductDb => {
        const url = config.getOrThrow<string>('PRIME_DATABASE_URL');
        const pool: Pool = createPool(url);
        return createDb(pool);
      },
    },
  ],
  exports: [PRODUCT_DB],
})
export class DatabaseModule {}
