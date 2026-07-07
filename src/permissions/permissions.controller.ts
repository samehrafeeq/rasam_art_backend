import { Controller, Get, Patch, Body, Param, UseGuards, ForbiddenException, Request } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('permissions')
@UseGuards(AuthGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  /**
   * GET /api/permissions/catalogue
   * Returns all available permissions with labels & categories.
   * Available to ADMIN only.
   */
  @Get('catalogue')
  getCatalogue(@Request() req) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('غير مصرح لك');
    }
    return this.permissionsService.getCatalogue();
  }

  /**
   * GET /api/permissions/roles
   * Returns effective permissions for every role.
   * Available to ADMIN only.
   */
  @Get('roles')
  async getRolesPermissions(@Request() req) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('غير مصرح لك');
    }
    return this.permissionsService.getRolesPermissions();
  }

  /**
   * GET /api/permissions/my
   * Returns effective permissions for the currently logged-in user.
   */
  @Get('my')
  async getMyPermissions(@Request() req) {
    return {
      role: req.user.role,
      permissions: await this.permissionsService.getEffectivePermissions(req.user.role),
    };
  }

  /**
   * PATCH /api/permissions/roles/:role
   * Update permissions for a specific role.
   * Body: { updates: [{ permission: string, granted: boolean }] }
   * Available to ADMIN only.
   */
  @Patch('roles/:role')
  async updateRolePermissions(
    @Request() req,
    @Param('role') role: string,
    @Body() body: { updates: { permission: string; granted: boolean }[] },
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('غير مصرح لك');
    }

    if (role === 'ADMIN' || role === 'USER') {
      throw new ForbiddenException('لا يمكن تعديل صلاحيات هذا الدور');
    }

    return this.permissionsService.updateRolePermissions(role, body.updates);
  }
}
