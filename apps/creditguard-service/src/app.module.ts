import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { DatabaseModule } from './db/database.module';
import { AppController } from './app.controller';
import { createDocumentStorage, DOCUMENT_STORAGE } from './documents/document-storage';
import { ConfigService } from '@nestjs/config';
import { ProductAuthGuard } from './auth/product-auth.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: Math.max(1, Number(config.get('DOCUMENT_MAX_FILE_SIZE_MB') ?? 10)) * 1024 * 1024,
          files: 1,
        },
      }),
    }),
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [
    ProductAuthGuard,
    {
      provide: DOCUMENT_STORAGE,
      inject: [ConfigService],
      useFactory: createDocumentStorage,
    },
  ],
})
export class AppModule {}
