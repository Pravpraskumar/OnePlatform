import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get<string>('CORS_ORIGIN')?.split(',') ?? true });
  const port = Number(config.get('PORT') ?? 4101);
  await app.listen(port);
  console.log(`creditguard-service listening on http://localhost:${port}/api`);
}

bootstrap();
