import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { appConfig } from './config/app.config';

const cookieParser = require('cookie-parser') as () => any;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const cfg = appConfig();

  app.enableCors({
    origin: cfg.allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-XSRF-TOKEN',
      'Idempotency-Key',
      'X-Request-Hash',
    ],
    credentials: true, // Required for HttpOnly cookie (refresh_token)
  });

  // Enable cookie parsing (refresh_token cookie)
  app.use(cookieParser());

  await app.listen(cfg.port);
}
void bootstrap();
