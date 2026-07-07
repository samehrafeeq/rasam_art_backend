import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ALL_PERMISSIONS,
  DEFAULT_PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSION_CATEGORIES,
  ROLE_LABELS,
  Permission,
} from '../auth/permissions';

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get the full permissions catalogue: all permissions, labels, and categories.
   */
  getCatalogue() {
    return {
      permissions: ALL_PERMISSIONS,
      labels: PERMISSION_LABELS,
      categories: PERMISSION_CATEGORIES,
      roleLabels: ROLE_LABELS,
    };
  }

  /**
   * Get effective permissions for every non-USER role.
   * Returns a map: { EMPLOYEE: [...perms], BRANCH_MANAGER: [...perms] }
   */
  async getRolesPermissions(): Promise<Record<string, { permission: string; granted: boolean }[]>> {
    const roles = ['EMPLOYEE', 'BRANCH_MANAGER'];
    const result: Record<string, { permission: string; granted: boolean }[]> = {};

    for (const role of roles) {
      const defaults = new Set(DEFAULT_PERMISSIONS[role] || []);

      // Load custom overrides
      const overrides = await this.prisma.rolePermission.findMany({
        where: { role: role as any },
      });
      const overrideMap = new Map(
        overrides.map((o) => [o.permission, o.granted]),
      );

      // Build effective list
      result[role] = ALL_PERMISSIONS.map((perm) => {
        let granted: boolean;
        if (overrideMap.has(perm)) {
          granted = overrideMap.get(perm)!;
        } else {
          granted = defaults.has(perm);
        }
        return { permission: perm, granted };
      });
    }

    return result;
  }

  /**
   * Get effective permissions for a single role (used at login / guard time).
   */
  async getEffectivePermissions(role: string): Promise<string[]> {
    if (role === 'ADMIN') return [...ALL_PERMISSIONS];
    if (role === 'USER') return [];

    const defaults = new Set(DEFAULT_PERMISSIONS[role] || []);

    const overrides = await this.prisma.rolePermission.findMany({
      where: { role: role as any },
    });

    for (const override of overrides) {
      if (override.granted) {
        defaults.add(override.permission as Permission);
      } else {
        defaults.delete(override.permission as Permission);
      }
    }

    return Array.from(defaults);
  }

  /**
   * Update permissions for a role.
   * Accepts an array of { permission, granted } objects.
   * Creates or updates overrides in the DB — only stores diffs from defaults.
   */
  async updateRolePermissions(
    role: string,
    updates: { permission: string; granted: boolean }[],
  ) {
    const defaults = new Set(DEFAULT_PERMISSIONS[role] || []);

    for (const { permission, granted } of updates) {
      // Check if this matches the default — if so, remove any override
      const isDefault = defaults.has(permission as Permission);

      if (granted === isDefault) {
        // Matches default → remove custom override if exists
        await this.prisma.rolePermission.deleteMany({
          where: { role: role as any, permission },
        });
      } else {
        // Differs from default → upsert the override
        await this.prisma.rolePermission.upsert({
          where: {
            role_permission: { role: role as any, permission },
          },
          create: { role: role as any, permission, granted },
          update: { granted },
        });
      }
    }

    return this.getRolesPermissions();
  }
}
