import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

const KEYS = {
  ORG_ID: 'tenant.orgId',
  USER_ID: 'tenant.userId',
  USER_ROLE: 'tenant.userRole',
  ORG_ROLE: 'tenant.orgRole',
} as const;

export interface TenantContext {
  orgId?: string;
  userId?: string;
  userRole?: string;
  orgRole?: 'OWNER' | 'ORG_ADMIN' | 'MEMBER' | 'EXTERNAL';
}

/**
 * Reads and writes the tenant context for the current async execution scope.
 *
 * The values are stored in nestjs-cls's AsyncLocalStorage and are populated by
 * the TenantContextInterceptor at the start of every authenticated HTTP
 * request. Background jobs and cron tasks should use `runWithTenantBypass` or
 * manually scope their own CLS context.
 *
 * Accessors return `undefined` when called outside an active CLS context
 * (e.g. during module init); consumers must treat them as optional.
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly cls: ClsService) {}

  getOrgId(): string | undefined {
    if (!this.cls.isActive()) return undefined;
    return this.cls.get<string>(KEYS.ORG_ID);
  }

  getUserId(): string | undefined {
    if (!this.cls.isActive()) return undefined;
    return this.cls.get<string>(KEYS.USER_ID);
  }

  getUserRole(): string | undefined {
    if (!this.cls.isActive()) return undefined;
    return this.cls.get<string>(KEYS.USER_ROLE);
  }

  getOrgRole(): TenantContext['orgRole'] {
    if (!this.cls.isActive()) return undefined;
    return this.cls.get<TenantContext['orgRole']>(KEYS.ORG_ROLE);
  }

  /** Convenience accessor for the full context snapshot. */
  snapshot(): TenantContext {
    return {
      orgId: this.getOrgId(),
      userId: this.getUserId(),
      userRole: this.getUserRole(),
      orgRole: this.getOrgRole(),
    };
  }

  /**
   * Replace the entire tenant context. Call this once per request after the
   * JWT has been validated. Subsequent calls in the same request overwrite,
   * which is intentional (e.g. mid-request impersonation by SUPER_ADMIN).
   */
  setContext(ctx: TenantContext): void {
    if (!this.cls.isActive()) {
      // No active CLS scope. We deliberately do not throw because the
      // application bootstrap and some test paths exercise services without
      // an HTTP request driving the CLS lifecycle.
      return;
    }
    if (ctx.orgId !== undefined) this.cls.set(KEYS.ORG_ID, ctx.orgId);
    if (ctx.userId !== undefined) this.cls.set(KEYS.USER_ID, ctx.userId);
    if (ctx.userRole !== undefined) this.cls.set(KEYS.USER_ROLE, ctx.userRole);
    if (ctx.orgRole !== undefined) this.cls.set(KEYS.ORG_ROLE, ctx.orgRole);
  }

  /** Check whether an org-scoped action is allowed in the current context. */
  hasOrgContext(): boolean {
    return this.getOrgId() !== undefined;
  }

  /**
   * `true` when the current actor is a SUPER_ADMIN. This is the only role that
   * can operate without an orgId in its context (via X-Org-Id impersonation
   * or by querying cross-org admin endpoints).
   */
  isSuperAdmin(): boolean {
    return this.getUserRole() === 'SUPER_ADMIN';
  }

  /**
   * `true` when the current actor's per-org role bypasses the warehouse-level
   * filter (i.e. they see all warehouses inside their org). OWNER and
   * ORG_ADMIN both qualify.
   */
  bypassesWarehouseFilter(): boolean {
    const role = this.getOrgRole();
    return role === 'OWNER' || role === 'ORG_ADMIN';
  }
}
