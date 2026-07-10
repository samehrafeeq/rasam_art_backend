import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { PermissionsService } from '../permissions/permissions.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get the required permissions from the decorator
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions are required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('غير مصرح لك بالوصول');
    }

    // ADMIN always has full access
    if (user.role === 'ADMIN') {
      return true;
    }

    // Get effective permissions for the user (role + per-user overrides)
    const effectivePermissions = await this.permissionsService.getEffectivePermissions(
      user.role,
      user.sub,
    );

    // Check that all required permissions are granted
    const hasPermission = requiredPermissions.every((p) =>
      effectivePermissions.includes(p),
    );

    if (!hasPermission) {
      throw new ForbiddenException('ليس لديك الصلاحية للقيام بهذا الإجراء');
    }

    return true;
  }
}
