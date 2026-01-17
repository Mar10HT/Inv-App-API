import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify which roles can access an endpoint
 * @param roles - Array of roles that are allowed to access
 * @example @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
