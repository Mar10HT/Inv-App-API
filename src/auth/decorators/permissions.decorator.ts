import { SetMetadata } from '@nestjs/common';
import type { PermissionKey } from '../../common/constants';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Specifies which permissions are required to access an endpoint.
 * The user must have at least one of the listed permissions.
 *
 * @example
 * @Permissions('inventory:create', 'inventory:edit')
 */
export const Permissions = (...perms: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, perms);
