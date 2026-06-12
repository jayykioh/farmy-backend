import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  const redis = {
    eval: jest.fn(),
    ttl: jest.fn(),
  };

  let service: RateLimiterService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    service = new RateLimiterService(redis as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows requests up to the limit and returns remaining/resetAt', async () => {
    redis.eval.mockResolvedValue(1);
    redis.ttl.mockResolvedValue(60);

    await expect(service.consume('llm:rpm:flash', 14, 60)).resolves.toEqual({
      allowed: true,
      remaining: 13,
      resetAt: 61_000,
    });

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('INCR'),
      1,
      'llm:rpm:flash',
      '60',
    );
  });

  it('denies requests above the limit', async () => {
    redis.eval.mockResolvedValue(15);
    redis.ttl.mockResolvedValue(20);

    await expect(service.consume('llm:rpm:flash', 14, 60)).resolves.toEqual({
      allowed: false,
      remaining: 0,
      resetAt: 21_000,
    });
  });

  it('parses string counts returned by Redis clients', async () => {
    redis.eval.mockResolvedValue('3');
    redis.ttl.mockResolvedValue(10);

    await expect(service.consume('llm:rpm:embed', 95, 60)).resolves.toEqual({
      allowed: true,
      remaining: 92,
      resetAt: 11_000,
    });
  });
});
