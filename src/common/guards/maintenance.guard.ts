import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminService } from '../../modules/admin/application/services/admin.service';

@Injectable()
export class MaintenanceGuard implements CanActivate {
  constructor(
    private readonly adminService: AdminService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const { maintenanceMode } = this.adminService.getSystemConfig();

    if (!maintenanceMode) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const path = request.path || '';

    // Allow core system endpoints
    if (
      path.includes('/auth/login') ||
      path.includes('/admin') ||
      path.includes('/health') ||
      path.includes('/csrf-token')
    ) {
      return true;
    }

    const user = request.user;
    // Allow admins/moderators to access anything
    if (user && (user.role === 'admin' || user.role === 'moderator')) {
      return true;
    }

    throw new ServiceUnavailableException({
      success: false,
      error_code: 'MAINTENANCE_MODE',
      message: 'Hệ thống đang bảo trì. Vui lòng quay lại sau.',
    });
  }
}
