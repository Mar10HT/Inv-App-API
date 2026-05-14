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
import { AuthenticatedUser } from '../interfaces/auth-user.interface';

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

    // Open-by-default: if no @Permissions() decorator is present on the handler
    // or its class, ANY authenticated user is allowed through (including EXTERNAL
    // and VIEWER roles). This mirrors the previous RolesGuard behaviour.
    // To restrict a new handler to authenticated-only access without a specific
    // permission, add @Permissions() with an empty array explicitly, or apply
    // @UseGuards(JwtAuthGuard) alone. Any handler that should be truly public
    // must bypass JwtAuthGuard as well.
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const { user } = request;

    if (!user) throw new ForbiddenException('User not authenticated');

    // SYSTEM_ADMIN bypasses all permission checks. We only audit MUTATING
    // requests (POST/PUT/PATCH/DELETE) under the bypass — auditing every GET
    // floods the log with one entry per page navigation and drowns out real
    // CREATE/UPDATE events. Read access by a trusted admin is not a security-
    // relevant event we need a per-request trail for.
    if (user.role === 'SYSTEM_ADMIN') {
      const method = request.method.toUpperCase();
      const isMutation =
        method === 'POST' ||
        method === 'PUT' ||
        method === 'PATCH' ||
        method === 'DELETE';
      if (isMutation) {
        this.auditService
          .log({
            action: 'ACCESS',
            entity: 'system_admin_bypass',
            entityId: user.userId,
            userId: user.userId,
            changes: {
              fields: required,
              after: { method, path: request.path },
            },
          })
          .catch(() => undefined); // Non-blocking; never fail the request over audit
      }
      return true;
    }

    const userPermissions = await this.permissionsService.getPermissionsForUser(
      user.userId,
    );

    // ['*'] means full access (SYSTEM_ADMIN resolved via service)
    if (userPermissions.includes('*')) return true;

    // OR semantics: access is granted when the user holds ANY one of the
    // declared permissions. Use multiple @Permissions() keys on one handler
    // to allow different roles to share an endpoint (e.g. both 'items:view'
    // and 'warehouse:view' may read the same resource).
    const hasPermission = required.some((perm) =>
      userPermissions.includes(perm),
    );

    if (!hasPermission) {
      // Use a generic message to avoid leaking required permission keys to the client.
      throw new ForbiddenException('Access denied');
    }

    return true;
  }
}
