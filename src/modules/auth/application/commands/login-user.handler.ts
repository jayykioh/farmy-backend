import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { LoginUserCommand } from './login-user.command';
import { Inject, UnauthorizedException } from '@nestjs/common';
import type { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { IUserRepositoryToken } from '../../domain/repositories/user-repository.interface';
import type { ITokenService } from '../services/token-service.interface';
import { ITokenServiceToken } from '../services/token-service.interface';
import * as bcrypt from 'bcrypt';

@CommandHandler(LoginUserCommand)
export class LoginUserHandler implements ICommandHandler<LoginUserCommand> {
  constructor(
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    @Inject(ITokenServiceToken)
    private readonly tokenService: ITokenService,
  ) {}

  async execute(command: LoginUserCommand) {
    const { dto } = command;

    const user = await this.userRepository.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException({
        errorCode: 'AUTH_INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không chính xác!',
      });
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.getPasswordHash(),
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        errorCode: 'AUTH_INVALID_CREDENTIALS',
        message: 'Email hoặc mật khẩu không chính xác!',
      });
    }

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
