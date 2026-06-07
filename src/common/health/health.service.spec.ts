import { ServiceUnavailableException } from '@nestjs/common';
import { HealthService } from './health.service';

describe('HealthService', () => {
  const connectionMock = {
    readyState: 1,
    db: {
      command: jest.fn(),
    },
  };

  const migrationModelMock = {
    estimatedDocumentCount: jest.fn(() => ({
      exec: jest.fn(),
    })),
  };

  let service: HealthService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new HealthService(
      connectionMock as never,
      migrationModelMock as never,
    );
  });

  it('returns healthy when all checks pass', async () => {
    jest.spyOn(service as any, 'checkDb').mockResolvedValue({ status: 'up' });
    jest
      .spyOn(service as any, 'checkMongo')
      .mockResolvedValue({ status: 'up' });
    jest
      .spyOn(service as any, 'checkRedis')
      .mockResolvedValue({ status: 'up' });

    await expect(service.check()).resolves.toEqual({
      healthy: true,
      db: { status: 'up' },
      mongo: { status: 'up' },
      redis: { status: 'up' },
    });
  });

  it('throws ServiceUnavailableException when any dependency is down', async () => {
    jest.spyOn(service as any, 'checkDb').mockResolvedValue({ status: 'up' });
    jest.spyOn(service as any, 'checkMongo').mockResolvedValue({
      status: 'down',
      details: 'Mongo ping failed',
    });
    jest
      .spyOn(service as any, 'checkRedis')
      .mockResolvedValue({ status: 'up' });

    await expect(service.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
