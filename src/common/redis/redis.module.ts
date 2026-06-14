import { Global, Module } from '@nestjs/common';
import { REDIS_CLIENT } from './redis.constants';
import { RedisConnectionService } from './redis.service';

@Global()
@Module({
  providers: [
    RedisConnectionService,
    {
      provide: REDIS_CLIENT,
      useFactory: (redisService: RedisConnectionService) => redisService.client,
      inject: [RedisConnectionService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
