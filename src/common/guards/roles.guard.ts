import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../decorators/current-user.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException({
        errorCode: 'AUTH_UNAUTHENTICATED',
        message: 'Bạn cần đăng nhập để thực hiện thao tác này!',
      });
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException({
        errorCode: 'AUTH_FORBIDDEN',
        message: 'Bạn không có quyền truy cập tài nguyên này!',
      });
    }

    return true;
  }
}
