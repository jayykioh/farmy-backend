import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.constants';

export interface ConsumeResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

@Injectable()
export class RateLimiterService {
  private readonly lua = `
    local cur = redis.call('INCR', KEYS[1])
    if cur == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    elseif redis.call('TTL', KEYS[1]) == -1 then
      -- Defensive: key tồn tại nhưng không có TTL (e.g. Redis restart, manual set)
      -- → set lại TTL để tránh block vĩnh viễn
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    return cur
  `;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async consume(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<ConsumeResult> {
    const rawCount = await this.redis.eval(
      this.lua,
      1,
      key,
      String(windowSeconds),
    );
    const count =
      typeof rawCount === 'number' ? rawCount : parseInt(String(rawCount), 10);
    const ttl = await this.redis.ttl(key);
    const resetAt = Date.now() + Math.max(ttl, 0) * 1000;

    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      resetAt,
    };
  }
}
