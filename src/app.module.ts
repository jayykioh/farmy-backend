import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { FarmModule } from './modules/farm/farm.module';
import { PetModule } from './modules/pet/pet.module';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters/auth-exception.filter';
import { HealthService } from './common/health/health.service';
import { DbModule } from './db/db.module';
import { RedisModule } from './common/redis/redis.module';
import { StorageModule } from './modules/storage/storage.module';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { appConfig } from './config/app.config';
import { AiModule } from './modules/ai/ai.module';

@Module({
  imports: [
    // nestjs-pino Logger
    LoggerModule.forRoot({
      pinoHttp: {
        autoLogging: true,
        transport:
          process.env.NODE_ENV !== 'production'
            ? {
                target: 'pino-pretty',
                options: {
                  singleLine: true,
                },
              }
            : undefined,
      },
    }),

    // Config (global)
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig],
    }),

    // MongoDB
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>(
          'MONGO_URI',
          'mongodb+srv://adnparr_db_user:Dong1234@farmdiaries.ytxyxvl.mongodb.net/?appName=FarmDiaries',
        ),
      }),
      inject: [ConfigService],
    }),

    // BullMQ — kết nối Redis (dùng cho reminder queue)
    BullModule.forRootAsync({
      useFactory: () => {
        const cfg = appConfig();
        const redisUrl = cfg.redis.url;
        if (redisUrl) {
          return { connection: { url: redisUrl } };
        }
        return {
          connection: {
            host: cfg.redis.host,
            port: cfg.redis.port,
            ...(cfg.redis.password ? { password: cfg.redis.password } : {}),
          },
        };
      },
    }),

    // Scheduler (Cron Jobs)
    ScheduleModule.forRoot(),

    DbModule,
    // Redis global client (REDIS_CLIENT token) — phải import ở root để @Global() hoạt động đúng
    RedisModule,
    AuthModule,
    FarmModule,
    PetModule,
    AiModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    HealthService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CsrfMiddleware)
      .forRoutes('*');
  }
}
