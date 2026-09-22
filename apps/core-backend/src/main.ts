import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN')?.split(',') ?? true,
    credentials: true,
  });

  const port = Number(config.get('CORE_PORT') ?? config.get('PORT') ?? 4000);
  const host = config.get<string>('HOST') ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`platform-core-backend listening on http://${host}:${port}/api`);
}

bootstrap();
