import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',').map((origin) => origin.trim());
  app.enableCors({ origin: allowedOrigins, credentials: true });
  app.setGlobalPrefix('api');
  await app.listen(Number(process.env.CAPTUREPRO_PORT ?? 4103));
}

void bootstrap();