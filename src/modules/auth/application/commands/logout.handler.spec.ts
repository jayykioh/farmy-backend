import { LogoutHandler } from './logout.handler';
import { LogoutCommand } from './logout.command';
import type { IRefreshTokenRepository } from '../../domain/repositories/refresh-token-repository.interface';
import type { ITokenService } from '../services/token-service.interface';
import { RefreshToken } from '../../domain/refresh-token.aggregate';

describe('LogoutHandler', () => {
  let handler: LogoutHandler;
  let findByTokenMock: jest.Mock;
  let revokeFamilyMock: jest.Mock;
  let mockRefreshTokenRepository: IRefreshTokenRepository;
  let mockTokenService: ITokenService;

  beforeEach(() => {
    findByTokenMock = jest.fn();
    revokeFamilyMock = jest.fn();

    mockRefreshTokenRepository = {
      create: jest.fn(),
      findByToken: findByTokenMock,
      save: jest.fn(),
      revokeFamily: revokeFamilyMock,
    };

    mockTokenService = {
      generateAccessToken: jest.fn(),
      generateRefreshToken: jest.fn(),
      verifyRefreshToken: jest.fn(),
    };

    handler = new LogoutHandler(mockRefreshTokenRepository, mockTokenService);
  });

  it('should return immediately if refresh token is not provided', async () => {
    await handler.execute(new LogoutCommand(''));
    expect(findByTokenMock).not.toHaveBeenCalled();
  });

  it('should find token and revoke family if token exists', async () => {
    const tokenStr = 'valid-refresh-token';
    const mockTokenDoc = new RefreshToken(
      'token-id-123',
      tokenStr,
      'user-id-123',
      'family-id-123',
      false,
      false,
      new Date(),
    );

    findByTokenMock.mockResolvedValue(mockTokenDoc);
    revokeFamilyMock.mockResolvedValue(undefined);

    await handler.execute(new LogoutCommand(tokenStr));

    expect(findByTokenMock).toHaveBeenCalledWith(tokenStr);
    expect(revokeFamilyMock).toHaveBeenCalledWith('family-id-123');
  });

  it('should catch and ignore errors during database operations', async () => {
    const tokenStr = 'valid-refresh-token';
    findByTokenMock.mockRejectedValue(new Error('DB connection failed'));

    await expect(
      handler.execute(new LogoutCommand(tokenStr)),
    ).resolves.not.toThrow();
  });
});
