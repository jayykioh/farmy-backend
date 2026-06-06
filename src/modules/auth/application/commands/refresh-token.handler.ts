import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RefreshTokenCommand } from './refresh-token.command';
import { Inject, UnauthorizedException } from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { IUserRepositoryToken } from '../../domain/repositories/user-repository.interface';
import type { ITokenService } from '../services/token-service.interface';
import { ITokenServiceToken } from '../services/token-service.interface';
import type { IRefreshTokenRepository } from '../../domain/repositories/refresh-token-repository.interface';
import { IRefreshTokenRepositoryToken } from '../../domain/repositories/refresh-token-repository.interface';
import { RefreshToken } from '../../domain/refresh-token.aggregate';
import * as crypto from 'crypto';

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler implements ICommandHandler<RefreshTokenCommand> {
  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    @Inject(ITokenServiceToken)
    private readonly tokenService: ITokenService,
    @Inject(IRefreshTokenRepositoryToken)
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  async execute(command: RefreshTokenCommand) {
    const { refreshToken } = command;

    if (!refreshToken) {
      throw new UnauthorizedException({
        errorCode: 'AUTH_MISSING_TOKEN',
        message: 'Không tìm thấy Refresh Token!',
      });
    }

    // Find the token in the database
    const tokenDoc =
      await this.refreshTokenRepository.findByToken(refreshToken);
    if (!tokenDoc) {
      throw new UnauthorizedException({
        errorCode: 'AUTH_REFRESH_FAILED',
        message: 'Refresh Token không tồn tại!',
      });
    }

    // Check if the token's family has been revoked
    if (tokenDoc.getIsRevoked()) {
      throw new UnauthorizedException({
        errorCode: 'AUTH_REFRESH_FAILED',
        message: 'Refresh Token đã bị thu hồi!',
      });
    }

    // Token reuse detection
    if (tokenDoc.getIsUsed()) {
      // Theft detected! Revoke all tokens in this family
      await this.refreshTokenRepository.revokeFamily(tokenDoc.getFamilyId());
      throw new UnauthorizedException({
        errorCode: 'AUTH_TOKEN_REUSED',
        message: 'Refresh Token đã được sử dụng trước đó!',
      });
    }

    try {
      // Verify token signature/expiry
      const decoded = this.tokenService.verifyRefreshToken(refreshToken);
      const user = await this.userRepository.findById(decoded.sub);

      if (!user) {
        throw new UnauthorizedException({
          errorCode: 'AUTH_REFRESH_FAILED',
          message: 'Tài khoản không tồn tại hoặc đã bị xóa!',
        });
      }

      // Mark the current token as used
      tokenDoc.markAsUsed();
      await this.refreshTokenRepository.save(tokenDoc);

      // Issue rotated tokens
      const payload = {
        sub: user.getId(),
        email: user.getEmail(),
        role: user.getRole(),
        name: user.getName(),
      };

      const newAccessToken = this.tokenService.generateAccessToken(payload);
      const newRefreshToken = this.tokenService.generateRefreshToken(payload);

      // Persist the rotated refresh token in the same family
      const decodedNew = this.tokenService.verifyRefreshToken(newRefreshToken);
      const expiresAt = new Date(
        decodedNew.exp
          ? decodedNew.exp * 1000
          : Date.now() + 30 * 24 * 60 * 60 * 1000,
      );

      const rotatedRefreshToken = new RefreshToken(
        crypto.randomUUID(),
        newRefreshToken,
        user.getId(),
        tokenDoc.getFamilyId(), // Keep the same family ID
        false, // isUsed
        false, // isRevoked
        expiresAt,
      );

      await this.refreshTokenRepository.create(rotatedRefreshToken);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException({
        errorCode: 'AUTH_REFRESH_FAILED',
        message: 'Refresh Token không hợp lệ hoặc đã hết hạn!',
      });
    }
  }
}
