import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RefreshTokenCommand } from './refresh-token.command';
import { Inject, UnauthorizedException } from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { IUserRepositoryToken } from '../../domain/repositories/user-repository.interface';
import type { ITokenService } from '../services/token-service.interface';
import { ITokenServiceToken } from '../services/token-service.interface';

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler implements ICommandHandler<RefreshTokenCommand> {
  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    @Inject(ITokenServiceToken)
    private readonly tokenService: ITokenService,
  ) {}

  async execute(command: RefreshTokenCommand) {
    const { refreshToken } = command;

    if (!refreshToken) {
      throw new UnauthorizedException({
        errorCode: 'AUTH_MISSING_TOKEN',
        message: 'Không tìm thấy Refresh Token!',
      });
    }

    try {
      const decoded = this.tokenService.verifyRefreshToken(refreshToken);
      const user = await this.userRepository.findById(decoded.sub);

      if (!user) {
        throw new UnauthorizedException({
          errorCode: 'AUTH_REFRESH_FAILED',
          message: 'Tài khoản không tồn tại hoặc đã bị xóa!',
        });
      }

      const payload = {
        sub: user.getId(),
        email: user.getEmail(),
        role: user.getRole(),
        name: user.getName(),
      };

      const newAccessToken = this.tokenService.generateAccessToken(payload);
      const newRefreshToken = this.tokenService.generateRefreshToken(payload);

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user,
      };
    } catch {
      throw new UnauthorizedException({
        errorCode: 'AUTH_REFRESH_FAILED',
        message: 'Refresh Token không hợp lệ hoặc đã hết hạn!',
      });
    }
  }
}
