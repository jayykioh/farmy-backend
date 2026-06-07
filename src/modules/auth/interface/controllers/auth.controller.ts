import { Controller, Post, Body, Res, Req } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { Response, Request } from 'express';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { RegisterUserCommand } from '../../application/commands/register-user.command';
import { LoginUserCommand } from '../../application/commands/login-user.command';
import { RefreshTokenCommand } from '../../application/commands/refresh-token.command';
import { LogoutCommand } from '../../application/commands/logout.command';
import { Public } from '../../../../common/decorators/public.decorator';
import { User } from '../../domain/user.aggregate';

interface AuthCommandResult {
  accessToken: string;
  refreshToken: string;
  user: User;
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly commandBus: CommandBus) {}

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = (await this.commandBus.execute(
      new RegisterUserCommand(dto),
    )) as unknown as AuthCommandResult;

    // Set refresh token in HttpOnly cookie as required
    response.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return {
      success: true,
      message: 'Đăng ký tài khoản thành công. Vui lòng xác thực email nếu cần!',
      data: {
        userId: result.user.getId(),
        email: result.user.getEmail(),
        name: result.user.getName(),
        accessToken: result.accessToken,
      },
    };
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = (await this.commandBus.execute(
      new LoginUserCommand(dto),
    )) as unknown as AuthCommandResult;

    // Set refresh token in HttpOnly cookie
    response.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        expiresIn: 900, // 15 minutes
        user: {
          id: result.user.getId(),
          email: result.user.getEmail(),
          name: result.user.getName(),
          role: result.user.getRole(),
        },
      },
    };
  }

  @Public()
  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.['refresh_token'] as
      | string
      | undefined;
    const result = (await this.commandBus.execute(
      new RefreshTokenCommand(refreshToken),
    )) as unknown as AuthCommandResult;

    // Rotate refresh token
    response.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/api/v1/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return {
      success: true,
      data: {
        accessToken: result.accessToken,
        expiresIn: 900,
        user: {
          id: result.user.getId(),
          email: result.user.getEmail(),
          name: result.user.getName(),
          role: result.user.getRole(),
        },
      },
    };
  }

  @Post('logout')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.['refresh_token'] as
      | string
      | undefined;

    if (refreshToken) {
      await this.commandBus.execute(new LogoutCommand(refreshToken));
    }

    // Clear cookies
    response.clearCookie('refresh_token', {
      path: '/api/v1/auth',
    });

    return {
      success: true,
      message: 'Đăng xuất thành công!',
    };
  }
}
