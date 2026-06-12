import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { RateLimiterService } from './rate-limiter.service';

@Module({
  imports: [RedisModule],
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class RateLimiterModule {}
