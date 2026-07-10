import { Controller, Get, Patch, Delete, Body, Param, UseGuards, ForbiddenException, Request } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('permissions')
@UseGuards(AuthGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  /**
   * GET /permissions/catalogue
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
   * GET /permissions/roles
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
   * GET /permissions/my
   * Returns effective permissions for the currently logged-in user.
   * Includes per-user overrides.
   */
  @Get('my')
  async getMyPermissions(@Request() req) {
    return {
      role: req.user.role,
      permissions: await this.permissionsService.getEffectivePermissions(
        req.user.role,
        req.user.sub,
      ),
    };
  }

  /**
   * PATCH /permissions/roles/:role
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

  // ─── Per-User Permission Endpoints ──────────────────────────

  /**
   * GET /permissions/users/:userId
   * Returns detailed permission info for a specific user.
   * Shows role-level + user-level overrides.
   * Available to ADMIN only.
   */
  @Get('users/:userId')
  async getUserPermissions(
    @Request() req,
    @Param('userId') userId: string,
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('غير مصرح لك');
    }

    const result = await this.permissionsService.getUserPermissionDetails(+userId);
    if (!result) {
      throw new ForbiddenException('المستخدم غير موجود');
    }
    return result;
  }

  /**
   * PATCH /permissions/users/:userId
   * Update per-user permission overrides.
   * Body: { updates: [{ permission: string, granted: boolean }] }
   * Available to ADMIN only.
   */
  @Patch('users/:userId')
  async updateUserPermissions(
    @Request() req,
    @Param('userId') userId: string,
    @Body() body: { updates: { permission: string; granted: boolean }[] },
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('غير مصرح لك');
    }

    const result = await this.permissionsService.updateUserPermissions(+userId, body.updates);
    if (!result) {
      throw new ForbiddenException('المستخدم غير موجود');
    }
    return result;
  }

  /**
   * DELETE /permissions/users/:userId
   * Reset all per-user permission overrides (back to role defaults).
   * Available to ADMIN only.
   */
  @Delete('users/:userId')
  async resetUserPermissions(
    @Request() req,
    @Param('userId') userId: string,
  ) {
    if (req.user.role !== 'ADMIN') {
      throw new ForbiddenException('غير مصرح لك');
    }

    return this.permissionsService.resetUserPermissions(+userId);
  }
}
