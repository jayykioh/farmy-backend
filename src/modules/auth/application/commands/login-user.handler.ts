import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { LoginUserCommand } from './login-user.command';
import { Inject } from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { IUserRepositoryToken } from '../../domain/repositories/user-repository.interface';
import type { ITokenService } from '../services/token-service.interface';
import { ITokenServiceToken } from '../services/token-service.interface';
import type { IRefreshTokenRepository } from '../../domain/repositories/refresh-token-repository.interface';
import { IRefreshTokenRepositoryToken } from '../../domain/repositories/refresh-token-repository.interface';
import { RefreshToken } from '../../domain/refresh-token.aggregate';
import { createAuthError } from '../../../../common/auth/auth-errors';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@CommandHandler(LoginUserCommand)
export class LoginUserHandler implements ICommandHandler<LoginUserCommand> {
  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    @Inject(ITokenServiceToken)
    private readonly tokenService: ITokenService,
    @Inject(IRefreshTokenRepositoryToken)
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  async execute(command: LoginUserCommand) {
    const { dto } = command;

    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw createAuthError('AUTH_INVALID_CREDENTIALS');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.getPasswordHash(),
    );
    if (!isPasswordValid) {
      throw createAuthError('AUTH_INVALID_CREDENTIALS');
    }

    const payload = {
      sub: user.getId(),
      email: user.getEmail(),
      role: user.getRole(),
      name: user.getName(),
    };
    const accessToken = this.tokenService.generateAccessToken(payload);
    const refreshToken = this.tokenService.generateRefreshToken(payload);

    // Persist refresh token in DB
    const decoded = this.tokenService.verifyRefreshToken(refreshToken);
    const expiresAt = new Date(
      decoded.exp ? decoded.exp * 1000 : Date.now() + 30 * 24 * 60 * 60 * 1000,
    );
    const familyId = decoded.jti || crypto.randomUUID();

    const refreshTokenEntity = new RefreshToken(
      crypto.randomUUID(),
      refreshToken,
      user.getId(),
      familyId,
      false, // isUsed
      false, // isRevoked
      expiresAt,
    );
    await this.refreshTokenRepository.create(refreshTokenEntity);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }
}
