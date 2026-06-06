import { RefreshTokenHandler } from './refresh-token.handler';
import { RefreshTokenCommand } from './refresh-token.command';
import type { IUserRepository } from '../../domain/repositories/user-repository.interface';
import type { ITokenService } from '../services/token-service.interface';
import type { IRefreshTokenRepository } from '../../domain/repositories/refresh-token-repository.interface';
import { RefreshToken } from '../../domain/refresh-token.aggregate';
import { User } from '../../domain/user.aggregate';
import { Email } from '../../domain/value-objects/email.value-object';
import { UnauthorizedException } from '@nestjs/common';

describe('RefreshTokenHandler', () => {
  let handler: RefreshTokenHandler;
  let findByIdMock: jest.Mock;
  let mockUserRepository: IUserRepository;

  let verifyRefreshTokenMock: jest.Mock;
  let generateAccessTokenMock: jest.Mock;
  let generateRefreshTokenMock: jest.Mock;
  let mockTokenService: ITokenService;

  let findByTokenMock: jest.Mock;
  let saveMock: jest.Mock;
  let revokeFamilyMock: jest.Mock;
  let createMock: jest.Mock;
  let mockRefreshTokenRepository: IRefreshTokenRepository;

  beforeEach(() => {
    findByIdMock = jest.fn();
    mockUserRepository = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: findByIdMock,
      save: jest.fn(),
    };

    verifyRefreshTokenMock = jest.fn();
    generateAccessTokenMock = jest.fn();
    generateRefreshTokenMock = jest.fn();
    mockTokenService = {
      generateAccessToken: generateAccessTokenMock,
      generateRefreshToken: generateRefreshTokenMock,
      verifyRefreshToken: verifyRefreshTokenMock,
    };

    findByTokenMock = jest.fn();
    saveMock = jest.fn();
    revokeFamilyMock = jest.fn();
    createMock = jest.fn();
    mockRefreshTokenRepository = {
      create: createMock,
      findByToken: findByTokenMock,
      save: saveMock,
      revokeFamily: revokeFamilyMock,
    };

    handler = new RefreshTokenHandler(
      mockUserRepository,
      mockTokenService,
      mockRefreshTokenRepository,
    );
  });

  it('should throw UnauthorizedException if refresh token is missing', async () => {
    await expect(handler.execute(new RefreshTokenCommand(''))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException if token does not exist in database', async () => {
    findByTokenMock.mockResolvedValue(null);

    await expect(
      handler.execute(new RefreshTokenCommand('non-existent-token')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if token is already revoked', async () => {
    const mockTokenDoc = new RefreshToken(
      'token-id',
      'revoked-token',
      'user-id',
      'family-id',
      false, // isUsed
      true, // isRevoked
      new Date(),
    );
    findByTokenMock.mockResolvedValue(mockTokenDoc);

    await expect(
      handler.execute(new RefreshTokenCommand('revoked-token')),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should detect token reuse, revoke the whole family, and throw', async () => {
    const mockTokenDoc = new RefreshToken(
      'token-id',
      'reused-token',
      'user-id',
      'family-id',
      true, // isUsed
      false, // isRevoked
      new Date(),
    );
    findByTokenMock.mockResolvedValue(mockTokenDoc);
    revokeFamilyMock.mockResolvedValue(undefined);

    await expect(
      handler.execute(new RefreshTokenCommand('reused-token')),
    ).rejects.toThrow(
      new UnauthorizedException({
        errorCode: 'AUTH_TOKEN_REUSED',
        message: 'Refresh Token đã được sử dụng trước đó!',
      }),
    );

    expect(revokeFamilyMock).toHaveBeenCalledWith('family-id');
  });

  it('should rotate token successfully if token is valid and not used', async () => {
    const mockTokenDoc = new RefreshToken(
      'token-id',
      'valid-token',
      'user-id',
      'family-id',
      false, // isUsed
      false, // isRevoked
      new Date(Date.now() + 10000),
    );
    findByTokenMock.mockResolvedValue(mockTokenDoc);

    const mockDecoded = {
      sub: 'user-id',
      exp: Math.floor(Date.now() / 1000) + 100,
    };
    verifyRefreshTokenMock.mockReturnValue(mockDecoded);

    const mockUser = new User(
      'user-id',
      Email.create('user@example.com'),
      'password-hash',
      'Nguyen Van A',
      'user',
    );
    findByIdMock.mockResolvedValue(mockUser);

    generateAccessTokenMock.mockReturnValue('new-access-token');
    generateRefreshTokenMock.mockReturnValue('new-refresh-token');

    const result = await handler.execute(
      new RefreshTokenCommand('valid-token'),
    );

    expect(mockTokenDoc.getIsUsed()).toBe(true);
    expect(saveMock).toHaveBeenCalledWith(mockTokenDoc);
    expect(createMock).toHaveBeenCalled();
    expect(result).toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      user: mockUser,
    });
  });
});
