import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './modules/auth/auth.module';
import { FarmModule } from './modules/farm/farm.module';
import { PetModule } from './modules/pet/pet.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { HttpExceptionFilter } from './common/filters/auth-exception.filter';
import { HealthService } from './common/health/health.service';
import { DbModule } from './db/db.module';
import { PgModule } from './db/pg.module';
import { RedisModule } from './common/redis/redis.module';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { appConfig } from './config/app.config';
import { AiModule } from './modules/ai/ai.module';
import { ChatModule } from './modules/chat/chat.module';
import { PlantScanModule } from './modules/plant-scan/plant-scan.module';
import { ShopModule } from './modules/shop/shop.module';

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

    // PostgreSQL / Supabase
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url:
          process.env.NODE_ENV === 'test'
            ? configService.get<string>('TEST_SUPABASE_DB_URL') ||
              configService.get<string>('SUPABASE_DB_URL')
            : configService.get<string>('SUPABASE_DB_URL'),
        autoLoadEntities: true,
        synchronize: false, // We use migrations
      }),
      inject: [ConfigService],
    }),

    // MongoDB
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri:
          process.env.NODE_ENV === 'test'
            ? configService.get<string>('TEST_MONGO_URI') ||
              configService.get<string>('MONGO_URI')
            : configService.get<string>(
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
    PgModule,
    // Redis global client (REDIS_CLIENT token) — phải import ở root để @Global() hoạt động đúng
    RedisModule,
    AuthModule,
    FarmModule,
    PetModule,
    KnowledgeModule,
    AiModule,
    ChatModule,
    PlantScanModule,
    ShopModule,
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
    consumer.apply(CsrfMiddleware).forRoutes('*');
  }
}
