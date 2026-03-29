import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * @deprecated Use @Permissions() with PermissionsGuard instead.
 * This decorator will be removed in a future version.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
