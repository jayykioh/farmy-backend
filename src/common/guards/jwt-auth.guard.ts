import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    info: unknown,
  ): TUser {
    if (err || !user) {
      if (info instanceof Error) {
        if (info.name === 'TokenExpiredError') {
          throw new UnauthorizedException({
            errorCode: 'AUTH_TOKEN_EXPIRED',
            message: 'Access Token đã hết hạn!',
          });
        }
        if (info.message === 'No auth token') {
          throw new UnauthorizedException({
            errorCode: 'AUTH_MISSING_TOKEN',
            message: 'Không đính kèm Bearer token ở header!',
          });
        }
      } else if (info && typeof info === 'object') {
        const record = info as Record<string, unknown>;
        if (record.name === 'TokenExpiredError') {
          throw new UnauthorizedException({
            errorCode: 'AUTH_TOKEN_EXPIRED',
            message: 'Access Token đã hết hạn!',
          });
        }
        if (record.message === 'No auth token') {
          throw new UnauthorizedException({
            errorCode: 'AUTH_MISSING_TOKEN',
            message: 'Không đính kèm Bearer token ở header!',
          });
        }
      }
      throw new UnauthorizedException({
        errorCode: 'AUTH_INVALID_TOKEN',
        message: 'Token bị sai chữ ký hoặc sai cấu trúc!',
      });
    }
    return user;
  }
}
