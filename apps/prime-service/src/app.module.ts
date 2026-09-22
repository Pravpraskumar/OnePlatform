import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { DatabaseModule } from './db/database.module';
import { AppController } from './app.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, envFilePath: resolve(__dirname, '../../../.env') }), DatabaseModule],
  controllers: [AppController],
})
export class AppModule {}
