import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  Get,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { Response, Request } from 'express';
import { RegisterDto } from '../dtos/register.dto';
import { LoginDto } from '../dtos/login.dto';
import { PushSubscriptionDto } from '../dtos/push-subscription.dto';
import { RegisterUserCommand } from '../../application/commands/register-user.command';
import { LoginUserCommand } from '../../application/commands/login-user.command';
import { RefreshTokenCommand } from '../../application/commands/refresh-token.command';
import { LogoutCommand } from '../../application/commands/logout.command';
import { Public } from '../../../../common/decorators/public.decorator';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../../common/decorators/current-user.decorator';
import { Roles } from '../../../../common/decorators/roles.decorator';
import { User } from '../../domain/user.aggregate';
import { IUserRepositoryToken } from '../../domain/repositories/user-repository.interface';
import type { IUserRepository } from '../../domain/repositories/user-repository.interface';
import { EmailService } from '../../application/services/email.service';

interface AuthCommandResult {
  accessToken: string;
  refreshToken: string;
  user: User;
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(
    private readonly commandBus: CommandBus,
    @Inject(IUserRepositoryToken)
    private readonly userRepository: IUserRepository,
    private readonly emailService: EmailService,
  ) {}

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
        user_id: result.user.getId(),
        email: result.user.getEmail(),
        name: result.user.getName(),
        access_token: result.accessToken,
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
        access_token: result.accessToken,
        expires_in: 900, // 15 minutes
        user: {
          id: result.user.getId(),
          email: result.user.getEmail(),
          name: result.user.getName(),
          role: result.user.getRole(),
          phoneNumber: result.user.getPhoneNumber(),
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
        access_token: result.accessToken,
        expires_in: 900,
        user: {
          id: result.user.getId(),
          email: result.user.getEmail(),
          name: result.user.getName(),
          role: result.user.getRole(),
          phoneNumber: result.user.getPhoneNumber(),
        },
      },
    };
  }

  @Get('me')
  async getMe(@CurrentUser() currentUser: AuthenticatedUser) {
    const user = await this.userRepository.findById(currentUser.id);
    if (!user) throw new NotFoundException('Người dùng không tồn tại');

    return {
      success: true,
      data: {
        id: user.getId(),
        email: user.getEmail(),
        name: user.getName(),
        role: user.getRole(),
        phoneNumber: user.getPhoneNumber(),
      },
    };
  }

  @Roles('admin')
  @Get('admin')
  getAdminArea(@CurrentUser() user: AuthenticatedUser) {
    return {
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        message: 'Admin access granted',
      },
    };
  }

  @Public()
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

  @Post('push-subscription')
  async updatePushSubscription(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PushSubscriptionDto,
  ) {
    const userAggregate = await this.userRepository.findById(user.id);
    if (!userAggregate) {
      throw new NotFoundException('Không tìm thấy người dùng!');
    }
    userAggregate.setPushSubscription(dto);
    await this.userRepository.save(userAggregate);
    return {
      success: true,
      message: 'Cập nhật đăng ký nhận thông báo thành công!',
    };
  }

  @Post('email-notification/test')
  async testEmailNotification(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const userAggregate = await this.userRepository.findById(user.id);
    if (!userAggregate) {
      throw new NotFoundException('Không tìm thấy người dùng!');
    }

    const email = userAggregate.getEmail();
    if (!email) {
      throw new BadRequestException('Người dùng chưa cập nhật email.');
    }

    const success = await this.emailService.sendEmailNotificationTest(email);
    if (!success) {
      throw new BadRequestException('Không thể gửi email test lúc này.');
    }

    // TODO: Cập nhật user-consent notification_email = true nếu cần thiết

    return {
      success: true,
      message: 'Gửi email test thành công!',
    };
  }
}
