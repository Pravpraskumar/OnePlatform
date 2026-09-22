import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.get<string>('CORS_ORIGIN')?.split(',') ?? true });
  const port = Number(config.get('PRIME_PORT') ?? config.get('PORT') ?? 4102);
  const host = config.get<string>('HOST') ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`prime-service listening on http://${host}:${port}/api`);
}

bootstrap();
