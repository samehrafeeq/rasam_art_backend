/**
 * permissions.ts
 * ---------------------------------------------------
 * Central permissions registry.
 * Defines every granular permission, categorised by module,
 * and the default permission set for each role.
 * ---------------------------------------------------
 */

// ─── Permission Constants ──────────────────────────

export const PERMISSIONS = {
  // Requests
  REQUESTS_VIEW: 'requests.view',
  REQUESTS_ACCEPT: 'requests.accept',
  REQUESTS_REJECT: 'requests.reject',
  REQUESTS_REVIEW_REJECTION: 'requests.review_rejection',

  // Regions / Branches
  REGIONS_VIEW: 'regions.view',
  REGIONS_CREATE: 'regions.create',
  REGIONS_EDIT: 'regions.edit',
  REGIONS_DELETE: 'regions.delete',

  // Users
  USERS_VIEW: 'users.view',
  USERS_CREATE: 'users.create',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',
  USERS_ASSIGN_ROLE: 'users.assign_role',

  // WhatsApp
  WHATSAPP_MANAGE: 'whatsapp.manage',

  // Contact messages
  MESSAGES_VIEW: 'messages.view',

  // Settings
  SETTINGS_MANAGE: 'settings.manage',

  // Dashboard
  DASHBOARD_VIEW: 'dashboard.view',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// Human-readable labels (Arabic) for the admin UI
export const PERMISSION_LABELS: Record<Permission, string> = {
  [PERMISSIONS.REQUESTS_VIEW]: 'عرض الطلبات',
  [PERMISSIONS.REQUESTS_ACCEPT]: 'قبول الطلبات',
  [PERMISSIONS.REQUESTS_REJECT]: 'رفض الطلبات مباشرة',
  [PERMISSIONS.REQUESTS_REVIEW_REJECTION]: 'مراجعة طلبات الرفض',
  [PERMISSIONS.REGIONS_VIEW]: 'عرض الفروع',
  [PERMISSIONS.REGIONS_CREATE]: 'إنشاء فرع',
  [PERMISSIONS.REGIONS_EDIT]: 'تعديل فرع',
  [PERMISSIONS.REGIONS_DELETE]: 'حذف فرع',
  [PERMISSIONS.USERS_VIEW]: 'عرض المستخدمين',
  [PERMISSIONS.USERS_CREATE]: 'إنشاء مستخدم',
  [PERMISSIONS.USERS_EDIT]: 'تعديل مستخدم',
  [PERMISSIONS.USERS_DELETE]: 'حذف مستخدم',
  [PERMISSIONS.USERS_ASSIGN_ROLE]: 'تغيير أدوار المستخدمين',
  [PERMISSIONS.WHATSAPP_MANAGE]: 'إدارة ربط واتساب',
  [PERMISSIONS.MESSAGES_VIEW]: 'عرض رسائل التواصل',
  [PERMISSIONS.SETTINGS_MANAGE]: 'إعدادات النظام',
  [PERMISSIONS.DASHBOARD_VIEW]: 'عرض لوحة القيادة',
};

// Group permissions by category for admin UI
export const PERMISSION_CATEGORIES: { label: string; permissions: Permission[] }[] = [
  {
    label: 'الطلبات',
    permissions: [
      PERMISSIONS.REQUESTS_VIEW,
      PERMISSIONS.REQUESTS_ACCEPT,
      PERMISSIONS.REQUESTS_REJECT,
      PERMISSIONS.REQUESTS_REVIEW_REJECTION,
    ],
  },
  {
    label: 'الفروع',
    permissions: [
      PERMISSIONS.REGIONS_VIEW,
      PERMISSIONS.REGIONS_CREATE,
      PERMISSIONS.REGIONS_EDIT,
      PERMISSIONS.REGIONS_DELETE,
    ],
  },
  {
    label: 'المستخدمين',
    permissions: [
      PERMISSIONS.USERS_VIEW,
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_EDIT,
      PERMISSIONS.USERS_DELETE,
      PERMISSIONS.USERS_ASSIGN_ROLE,
    ],
  },
  {
    label: 'النظام',
    permissions: [
      PERMISSIONS.WHATSAPP_MANAGE,
      PERMISSIONS.MESSAGES_VIEW,
      PERMISSIONS.SETTINGS_MANAGE,
      PERMISSIONS.DASHBOARD_VIEW,
    ],
  },
];

// ─── Default Permissions per Role ──────────────────
// ADMIN always has everything — no need to list.
// These defaults apply when no custom override exists in the DB.

export const DEFAULT_PERMISSIONS: Record<string, Permission[]> = {
  EMPLOYEE: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.REQUESTS_VIEW,
    PERMISSIONS.REQUESTS_ACCEPT,
  ],
  BRANCH_MANAGER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.REQUESTS_VIEW,
    PERMISSIONS.REQUESTS_ACCEPT,
    PERMISSIONS.REQUESTS_REJECT,
    PERMISSIONS.REQUESTS_REVIEW_REJECTION,
    PERMISSIONS.REGIONS_VIEW,
    PERMISSIONS.REGIONS_EDIT,
    PERMISSIONS.USERS_VIEW,
  ],
};

// All permission codes as a flat array
export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

// ─── Role Metadata ─────────────────────────────────

export const ROLE_LABELS: Record<string, string> = {
  USER: 'عميل',
  EMPLOYEE: 'موظف',
  BRANCH_MANAGER: 'مدير فرع',
  ADMIN: 'مالك النظام',
};

// Roles that can access the admin panel
export const ADMIN_PANEL_ROLES = ['ADMIN', 'BRANCH_MANAGER', 'EMPLOYEE'];

// Roles that are staff (can be assigned to a branch)
export const STAFF_ROLES = ['EMPLOYEE', 'BRANCH_MANAGER'];
