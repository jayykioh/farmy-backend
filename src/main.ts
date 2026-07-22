import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { appConfig } from './config/app.config';

const cookieParser = require('cookie-parser') as () => any;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  const cfg = appConfig();

  // Set Express body-parser limit to 15MB so multipart file uploads aren't
  // rejected at the Express layer before multer can validate them.
  // Multer still enforces MAX_FILE_SIZE (10MB) per-file on top of this.
  app.use(require('express').json({ limit: '15mb' }));
  app.use(require('express').urlencoded({ extended: true, limit: '15mb' }));

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
