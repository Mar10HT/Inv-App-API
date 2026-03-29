import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsService } from '../../permissions/permissions.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No permissions decorator — allow through
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();

    if (!user) throw new ForbiddenException('User not authenticated');

    // SYSTEM_ADMIN bypasses all permission checks
    if (user.role === 'SYSTEM_ADMIN') return true;

    const userPermissions = await this.permissionsService.getPermissionsForUser(
      user.userId,
    );

    // ['*'] means full access (SYSTEM_ADMIN resolved via service)
    if (userPermissions.includes('*')) return true;

    const hasPermission = required.some((perm) =>
      userPermissions.includes(perm),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied. Required: ${required.join(', ')}`,
      );
    }

    return true;
  }
}
