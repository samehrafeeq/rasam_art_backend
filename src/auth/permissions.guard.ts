import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { ALL_PERMISSIONS, DEFAULT_PERMISSIONS } from './permissions';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
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

    // Get effective permissions for the user's role
    const effectivePermissions = await this.getEffectivePermissions(user.role);

    // Check that all required permissions are granted
    const hasPermission = requiredPermissions.every((p) =>
      effectivePermissions.includes(p),
    );

    if (!hasPermission) {
      throw new ForbiddenException('ليس لديك الصلاحية للقيام بهذا الإجراء');
    }

    return true;
  }

  /**
   * Get the effective permissions for a role.
   * Starts with the default permissions, then applies any
   * custom overrides stored in the RolePermission table.
   */
  private async getEffectivePermissions(role: string): Promise<string[]> {
    // Start with defaults
    const defaults = new Set<string>(DEFAULT_PERMISSIONS[role] || []);

    // Fetch custom overrides from DB
    const overrides = await this.prisma.rolePermission.findMany({
      where: { role: role as any },
    });

    // Apply overrides
    for (const override of overrides) {
      if (override.granted) {
        defaults.add(override.permission);
      } else {
        defaults.delete(override.permission);
      }
    }

    return Array.from(defaults);
  }
}
