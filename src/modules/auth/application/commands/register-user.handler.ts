import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { RegisterUserCommand } from './register-user.command';
import { Inject, ConflictException } from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { IUserRepositoryToken } from '../../domain/repositories/user-repository.interface';
import type { ITokenService } from '../services/token-service.interface';
import { ITokenServiceToken } from '../services/token-service.interface';
import { User } from '../../domain/user.aggregate';
import { Email } from '../../domain/value-objects/email.value-object';
import { Password } from '../../domain/value-objects/password.value-object';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@CommandHandler(RegisterUserCommand)
export class RegisterUserHandler implements ICommandHandler<RegisterUserCommand> {
  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    @Inject(ITokenServiceToken)
    private readonly tokenService: ITokenService,
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
      throw new ConflictException({
        errorCode: 'AUTH_EMAIL_EXISTS',
        message: 'Email đã tồn tại trong hệ thống!',
      });
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

    return {
      user,
      accessToken,
      refreshToken,
    };
  }
}
