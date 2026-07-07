import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Decorator to mark an endpoint with the required permission(s).
 *
 * Usage:
 *   @RequirePermission('requests.accept')
 *   @UseGuards(AuthGuard, PermissionsGuard)
 *   @Patch(':id/status')
 *   acceptRequest(...) { ... }
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
