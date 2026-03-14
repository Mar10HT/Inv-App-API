import { UserRole } from '@prisma/client';

/**
 * Typed role constants — prefer these over raw strings to avoid typos
 * and get autocomplete/refactoring support.
 *
 * Usage:
 *   @Roles(ROLES.ADMIN, ROLES.MANAGER)
 */
export const ROLES = {
  ADMIN: UserRole.SYSTEM_ADMIN,
  MANAGER: UserRole.WAREHOUSE_MANAGER,
  USER: UserRole.USER,
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
