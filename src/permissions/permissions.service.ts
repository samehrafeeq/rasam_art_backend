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
   * Get effective permissions for a user.
   * Priority: UserPermission overrides > RolePermission overrides > Default role permissions
   * If userId is provided, per-user overrides are applied on top of role permissions.
   */
  async getEffectivePermissions(role: string, userId?: number): Promise<string[]> {
    if (role === 'ADMIN') return [...ALL_PERMISSIONS];
    if (role === 'USER') return [];

    // Step 1: Start with default role permissions
    const perms = new Set<string>(DEFAULT_PERMISSIONS[role] || []);

    // Step 2: Apply role-level overrides from DB
    const roleOverrides = await this.prisma.rolePermission.findMany({
      where: { role: role as any },
    });

    for (const override of roleOverrides) {
      if (override.granted) {
        perms.add(override.permission as Permission);
      } else {
        perms.delete(override.permission as Permission);
      }
    }

    // Step 3: Apply per-user overrides (highest priority)
    if (userId) {
      const userOverrides = await this.prisma.userPermission.findMany({
        where: { userId },
      });

      for (const override of userOverrides) {
        if (override.granted) {
          perms.add(override.permission);
        } else {
          perms.delete(override.permission);
        }
      }
    }

    return Array.from(perms);
  }

  /**
   * Get the per-user permission overrides for a specific user.
   * Returns all permissions with their effective state and override source.
   */
  async getUserPermissionDetails(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });

    if (!user) return null;

    // Get role-level effective permissions (without user overrides)
    const rolePerms = new Set<string>(
      await this.getEffectivePermissions(user.role),
    );

    // Get user-level overrides
    const userOverrides = await this.prisma.userPermission.findMany({
      where: { userId },
    });
    const userOverrideMap = new Map(
      userOverrides.map((o) => [o.permission, o.granted]),
    );

    // Build detailed list
    const details = ALL_PERMISSIONS.map((perm) => {
      const fromRole = rolePerms.has(perm);
      const hasUserOverride = userOverrideMap.has(perm);
      const userOverrideValue = userOverrideMap.get(perm);

      let effective: boolean;
      let source: 'role' | 'user_granted' | 'user_revoked' | 'none';

      if (hasUserOverride) {
        effective = userOverrideValue!;
        source = userOverrideValue ? 'user_granted' : 'user_revoked';
      } else {
        effective = fromRole;
        source = fromRole ? 'role' : 'none';
      }

      return {
        permission: perm,
        label: PERMISSION_LABELS[perm] || perm,
        effective,
        fromRole,
        source,
      };
    });

    return {
      user: { id: user.id, name: user.name, role: user.role },
      permissions: details,
    };
  }

  /**
   * Update per-user permission overrides.
   * Accepts an array of { permission, granted } objects.
   * If a user override matches the role-level effective permission, remove the override.
   */
  async updateUserPermissions(
    userId: number,
    updates: { permission: string; granted: boolean }[],
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user) return null;

    // Get role-level effective permissions (without user overrides)
    const roleEffective = new Set<string>(
      await this.getEffectivePermissions(user.role),
    );

    for (const { permission, granted } of updates) {
      const roleHas = roleEffective.has(permission);

      if (granted === roleHas) {
        // Matches role default → remove user override if exists
        await this.prisma.userPermission.deleteMany({
          where: { userId, permission },
        });
      } else {
        // Differs from role default → upsert user override
        await this.prisma.userPermission.upsert({
          where: {
            userId_permission: { userId, permission },
          },
          create: { userId, permission, granted },
          update: { granted },
        });
      }
    }

    return this.getUserPermissionDetails(userId);
  }

  /**
   * Reset all per-user permission overrides for a user (back to role defaults).
   */
  async resetUserPermissions(userId: number) {
    await this.prisma.userPermission.deleteMany({
      where: { userId },
    });
    return this.getUserPermissionDetails(userId);
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
