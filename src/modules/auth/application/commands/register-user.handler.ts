import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RegisterUserCommand } from './register-user.command';
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
import { Password } from '../../domain/value-objects/password.value-object';
import { createAuthError } from '../../../../common/auth/auth-errors';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand> {
  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    @Inject(ITokenServiceToken)
    private readonly tokenService: ITokenService,
    @Inject(IRefreshTokenRepositoryToken)
    private readonly refreshTokenRepository: IRefreshTokenRepository,
  ) {}

  async execute(command: RegisterUserCommand) {
    const { dto } = command;

    // Enforce Domain invariants through Value Objects
    const emailVO = Email.create(dto.email);
    const passwordVO = Password.create(dto.password);

    // Verify uniqueness
    const existingUser = await this.userRepository.findByEmail(
      emailVO.getValue(),
    );
    if (existingUser) {
      throw createAuthError('AUTH_EMAIL_EXISTS');
    }

    // Securely hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(passwordVO.getValue(), salt);

    // Instantiate aggregate
    const userId = crypto.randomUUID();
    const user = new User(userId, emailVO, passwordHash, dto.name, 'user');

    // Persist user aggregate
    await this.userRepository.create(user);

    // Issue initial session tokens
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
