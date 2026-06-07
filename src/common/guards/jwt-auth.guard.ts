import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { createAuthError } from '../auth/auth-errors';

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
          throw createAuthError('AUTH_TOKEN_EXPIRED');
        }
        if (info.message === 'No auth token') {
          throw createAuthError('AUTH_MISSING_ACCESS_TOKEN');
        }
      } else if (info && typeof info === 'object') {
        const record = info as Record<string, unknown>;
        if (record.name === 'TokenExpiredError') {
          throw createAuthError('AUTH_TOKEN_EXPIRED');
        }
        if (record.message === 'No auth token') {
          throw createAuthError('AUTH_MISSING_ACCESS_TOKEN');
        }
      }
      throw createAuthError('AUTH_INVALID_TOKEN');
    }
    return user;
  }
}
