import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { appConfig } from '../../config/app.config';

@Injectable()
export class RedisConnectionService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisConnectionService.name);
  readonly client: Redis;

  constructor() {
    const cfg = appConfig();
    this.client = cfg.redis.url
      ? new Redis(cfg.redis.url)
      : new Redis({
          host: cfg.redis.host,
          port: cfg.redis.port,
          ...(cfg.redis.password ? { password: cfg.redis.password } : {}),
        });

    this.client.on('error', (error: Error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
