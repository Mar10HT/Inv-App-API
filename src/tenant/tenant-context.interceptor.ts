import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from './tenant-context.service';
import { TenantFlagService } from './tenant-flag.service';

/**
 * Populates the per-request tenant context (orgId, userId, roles) into
 * nestjs-cls so the Prisma extension and other tenant-aware code can read it
 * without threading it through call sites.
 *
 * Order: runs after JwtAuthGuard (which sets request.user) and after
 * WarehouseAccessInterceptor (which adds request.user.warehouseIds).
 *
 * Behavior:
 * - No request.user (public route): no-op. CLS scope exists but stays empty.
 *   Any tenant-scoped Prisma query will throw because requireOrgId() fails.
 * - Normal user: read orgId/orgRole from JWT, set context.
 * - SUPER_ADMIN with X-Org-Id header: validate header format, impersonate the
 *   target org. Log the action.
 * - SUPER_ADMIN without header: set userRole only. They can still access
 *   non-tenant resources (Organization CRUD, user management).
 * - Non-SUPER_ADMIN sending X-Org-Id: reject with 403 (unauthorized
 *   impersonation attempt).
 *
 * Skips entirely when MULTI_TENANT_ENABLED=false. The legacy single-tenant
 * path keeps working untouched until the flag flips in Phase 7.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly flag: TenantFlagService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (!this.flag.isEnabled()) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request?.user as
      | {
          userId: string;
          email: string;
          role: string;
          orgId?: string;
          orgRole?: 'OWNER' | 'ORG_ADMIN' | 'MEMBER' | 'EXTERNAL';
        }
      | undefined;

    // Public route or auth failed earlier — nothing to populate.
    if (!user || !user.userId) {
      return next.handle();
    }

    const headerOrgId = this.extractOrgIdHeader(request);

    if (user.role === 'SUPER_ADMIN') {
      if (headerOrgId) {
        this.tenantContext.setContext({
          userId: user.userId,
          userRole: user.role,
          orgId: headerOrgId,
          // SUPER_ADMIN doesn't have a per-org role; treat as ORG_ADMIN so
          // they bypass the warehouse filter while impersonating.
          orgRole: 'ORG_ADMIN',
        });
        this.logger.warn(
          `SUPER_ADMIN impersonation: user=${user.email} org=${headerOrgId} path=${request.method} ${request.url}`,
        );
      } else {
        this.tenantContext.setContext({
          userId: user.userId,
          userRole: user.role,
        });
      }
      return next.handle();
    }

    // Non-SUPER_ADMIN: reject impersonation attempts.
    if (headerOrgId) {
      throw new ForbiddenException(
        'Only SUPER_ADMIN may impersonate an organization via X-Org-Id.',
      );
    }

    this.tenantContext.setContext({
      userId: user.userId,
      userRole: user.role,
      orgId: user.orgId,
      orgRole: user.orgRole,
    });

    return next.handle();
  }

  private extractOrgIdHeader(request: {
    headers?: Record<string, string | string[] | undefined>;
  }): string | undefined {
    const raw = request.headers?.['x-org-id'];
    if (!raw) return undefined;
    const value = Array.isArray(raw) ? raw[0] : raw;
    const trimmed = value?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : undefined;
  }
}
