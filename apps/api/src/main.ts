import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { CONFIG, type AppConfig } from './config';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.enableCors({ origin: true, credentials: true });
  const config = app.get<AppConfig>(CONFIG);
  await app.listen(config.port);
  // eslint-disable-next-line no-console
  console.log(`[halal-meet/api] listening on http://localhost:${config.port} (env=${config.nodeEnv})`);
}

void bootstrap();
