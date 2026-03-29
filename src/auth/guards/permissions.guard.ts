import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PermissionsService } from '../../permissions/permissions.service';
import { AuditService } from '../../audit/audit.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No permissions decorator — allow through
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const { user } = request as any;

    if (!user) throw new ForbiddenException('User not authenticated');

    // SYSTEM_ADMIN bypasses all permission checks — log the access
    if (user.role === 'SYSTEM_ADMIN') {
      this.auditService
        .log({
          action: 'ACCESS',
          entity: 'system_admin_bypass',
          entityId: user.userId,
          userId: user.userId,
          changes: {
            fields: required,
            after: { method: request.method, path: request.path },
          },
        })
        .catch(() => undefined); // Non-blocking; never fail the request over audit
      return true;
    }

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
