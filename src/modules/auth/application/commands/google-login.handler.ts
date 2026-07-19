import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { GoogleLoginCommand } from './google-login.command';
import { Inject } from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { IUserRepositoryToken } from '../../domain/repositories/user-repository.interface';
import type { ITokenService } from '../services/token-service.interface';
import { ITokenServiceToken } from '../services/token-service.interface';
import type { IRefreshTokenRepository } from '../../domain/repositories/refresh-token-repository.interface';
import { IRefreshTokenRepositoryToken } from '../../domain/repositories/refresh-token-repository.interface';
import { RefreshToken } from '../../domain/refresh-token.aggregate';
import { User } from '../../domain/user.aggregate';
import { Email } from '../../domain/value-objects/email.value-object';
import * as crypto from 'crypto';

@CommandHandler(GoogleLoginCommand)
export class GoogleLoginHandler implements ICommandHandler<GoogleLoginCommand> {
  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    @Inject(ITokenServiceToken)
    private readonly tokenService: ITokenService,
    @Inject(IRefreshTokenRepositoryToken)
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  async execute(command: GoogleLoginCommand) {
    const { payload } = command;

    let user = await this.userRepository.findByEmail(payload.email);

    // Nếu chưa có tài khoản thì tạo mới
    if (!user) {
      const emailObj = Email.create(payload.email);
      // Dummy password cho OAuth user, họ sẽ không thể đăng nhập bằng password trừ khi đổi lại
      const dummyPasswordHash = `[OAUTH_DUMMY]_${crypto.randomUUID()}`;

      user = new User(
        crypto.randomUUID(),
        emailObj,
        dummyPasswordHash,
        payload.name || payload.firstName || 'Google User',
        'user',
      );

      // Update avatar_url if available using setter or directly if available. Wait, aggregate doesn't have setter for avatar_url
      // Let's rely on MongooseUserRepository to save what it has. Since aggregate only has basic fields,
      // we'll just save it and update the db directly or extend aggregate if needed.
      // But aggregate saves what it maps. We'll just create the user.
      await this.userRepository.create(user);
    }

    const tokenPayload = {
      sub: user.getId(),
      email: user.getEmail(),
      role: user.getRole(),
      name: user.getName(),
    };

    const accessToken = this.tokenService.generateAccessToken(tokenPayload);
    const refreshToken = this.tokenService.generateRefreshToken(tokenPayload);

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
