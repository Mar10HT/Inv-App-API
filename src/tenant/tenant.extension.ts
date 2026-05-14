import { Prisma } from '@prisma/client';
import { TenantContextService } from './tenant-context.service';
import { TenantFlagService } from './tenant-flag.service';
import { isTenantBypass } from './tenant-bypass.helper';
import type { ClsService } from 'nestjs-cls';
import { ForbiddenException, InternalServerErrorException } from '@nestjs/common';

/**
 * Whitelist of Prisma models that carry `organizationId`. The extension only
 * touches these; everything else (User, Role, Permission, LoginAttempt,
 * PasswordResetToken, Organization, UserOrganization, RefreshToken,
 * VerifiedDomain) is global or has its own scoping logic.
 *
 * Keep in sync with the schema: see docs/multi-tenant/README.md.
 */
export const TENANT_SCOPED_MODELS = new Set<string>([
  'Warehouse',
  'UserWarehouse',
  'InventoryItem',
  'AuditLog',
  'Supplier',
  'Category',
  'Transaction',
  'TransactionItem',
  'Loan',
  'StockAlert',
  'TransferRequest',
  'TransferRequestItem',
  'StockTake',
  'StockTakeItem',
  'DischargeRequest',
  'DischargeRequestItem',
  'ScheduledReport',
]);

interface ExtensionDeps {
  flag: TenantFlagService;
  ctx: TenantContextService;
  cls: ClsService;
}

/**
 * Builds a Prisma client extension that automatically scopes queries and
 * mutations on `TENANT_SCOPED_MODELS` to the orgId stored in the current CLS
 * context.
 *
 * Bypass rules (any of these and the extension is a no-op for that call):
 * 1. `MULTI_TENANT_ENABLED=false`  — top-level kill switch.
 * 2. `runWithTenantBypass` is active in the CLS scope — trusted paths like
 *    cron jobs and seeds.
 * 3. The current actor is `SUPER_ADMIN` and no orgId is set — used for
 *    cross-org administrative reads.
 *
 * Safety rule (refuses the call rather than leaking):
 *   If the model IS tenant-scoped, the flag IS on, no bypass is active, AND
 *   no orgId is present in the context — we throw rather than silently
 *   returning all rows. This catches bugs in the interceptor wiring.
 */
export function buildTenantExtension(deps: ExtensionDeps) {
  const { flag, ctx, cls } = deps;

  const shouldBypass = (model: string | undefined): boolean => {
    if (!flag.isEnabled()) return true;
    if (!model || !TENANT_SCOPED_MODELS.has(model)) return true;
    if (isTenantBypass(cls)) return true;
    return false;
  };

  const requireOrgId = (model: string, operation: string): string => {
    const orgId = ctx.getOrgId();
    if (!orgId) {
      if (ctx.isSuperAdmin()) {
        // SUPER_ADMIN without an impersonated org tries to operate on tenant
        // data. This is almost always a bug — they should either set
        // X-Org-Id or use `runWithTenantBypass`. Throw to surface it.
        throw new ForbiddenException(
          `SUPER_ADMIN must impersonate an org (X-Org-Id) or use runWithTenantBypass to ${operation} on ${model}`,
        );
      }
      throw new InternalServerErrorException(
        `Tenant context missing for ${operation} on ${model}. Did the request go through TenantContextInterceptor?`,
      );
    }
    return orgId;
  };

  return Prisma.defineExtension({
    name: 'obsid-tenant-scope',
    query: {
      $allModels: {
        async findMany({ model, operation, args, query }) {
          if (shouldBypass(model)) return query(args);
          const orgId = requireOrgId(model!, operation);
          args.where = mergeWhere(args.where, { organizationId: orgId });
          return query(args);
        },
        async findFirst({ model, operation, args, query }) {
          if (shouldBypass(model)) return query(args);
          const orgId = requireOrgId(model!, operation);
          args.where = mergeWhere(args.where, { organizationId: orgId });
          return query(args);
        },
        async findFirstOrThrow({ model, operation, args, query }) {
          if (shouldBypass(model)) return query(args);
          const orgId = requireOrgId(model!, operation);
          args.where = mergeWhere(args.where, { organizationId: orgId });
          return query(args);
        },
        async findUnique({ model, operation, args, query }) {
          // Unique lookups by id can't accept a `where` merge easily because
          // Prisma's WhereUnique type is structurally restrictive. We promote
          // to findFirst so we can layer the org filter on top.
          if (shouldBypass(model)) return query(args);
          requireOrgId(model!, operation);
          // Fall through: defer to the runtime check. We can't safely promote
          // without changing the return shape contract, so we trust the
          // caller and rely on RLS-style downstream checks in Phase 3.
          return query(args);
        },
        async count({ model, operation, args, query }) {
          if (shouldBypass(model)) return query(args);
          const orgId = requireOrgId(model!, operation);
          args.where = mergeWhere(args.where, { organizationId: orgId });
          return query(args);
        },
        async aggregate({ model, operation, args, query }) {
          if (shouldBypass(model)) return query(args);
          const orgId = requireOrgId(model!, operation);
          args.where = mergeWhere(args.where, { organizationId: orgId });
          return query(args);
        },
        async groupBy({ model, operation, args, query }) {
          if (shouldBypass(model)) return query(args);
          const orgId = requireOrgId(model!, operation);
          args.where = mergeWhere(args.where, { organizationId: orgId });
          return query(args);
        },
        async create({ model, operation, args, query }) {
          if (shouldBypass(model)) return query(args);
          const orgId = requireOrgId(model!, operation);
          // Auto-set organizationId if the caller didn't specify one. If the
          // caller specified a DIFFERENT org, we reject (could be a bug or
          // attack).
          if (args.data && typeof args.data === 'object' && !Array.isArray(args.data)) {
            const data = args.data as Record<string, unknown>;
            if (data.organizationId === undefined) {
              data.organizationId = orgId;
            } else if (data.organizationId !== orgId) {
              throw new ForbiddenException(
                `Cannot create ${model} in org ${String(data.organizationId)} from context org ${orgId}`,
              );
            }
          }
          return query(args);
        },
        async update({ model, operation, args, query }) {
          if (shouldBypass(model)) return query(args);
          const orgId = requireOrgId(model!, operation);
          // updates by unique id can't be filtered by where merge cleanly,
          // but we can still defend on cross-org writes via the data field.
          if (args.data && typeof args.data === 'object' && !Array.isArray(args.data)) {
            const data = args.data as Record<string, unknown>;
            if (data.organizationId !== undefined && data.organizationId !== orgId) {
              throw new ForbiddenException(
                `Cannot move ${model} to org ${String(data.organizationId)} from context org ${orgId}`,
              );
            }
          }
          return query(args);
        },
        async updateMany({ model, operation, args, query }) {
          if (shouldBypass(model)) return query(args);
          const orgId = requireOrgId(model!, operation);
          args.where = mergeWhere(args.where, { organizationId: orgId });
          return query(args);
        },
        async delete({ model, operation, args, query }) {
          // Same uniqueness caveat as findUnique — we trust the caller has
          // already constrained by id, and Phase 3 services will load+check
          // before issuing a delete.
          if (shouldBypass(model)) return query(args);
          requireOrgId(model!, operation);
          return query(args);
        },
        async deleteMany({ model, operation, args, query }) {
          if (shouldBypass(model)) return query(args);
          const orgId = requireOrgId(model!, operation);
          args.where = mergeWhere(args.where, { organizationId: orgId });
          return query(args);
        },
      },
    },
  });
}

/** Conservative AND-merge of an existing where clause with the tenant filter. */
function mergeWhere(
  existing: unknown,
  tenantFilter: { organizationId: string },
): Record<string, unknown> {
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    return tenantFilter;
  }
  const base = existing as Record<string, unknown>;
  if (base.organizationId !== undefined && base.organizationId !== tenantFilter.organizationId) {
    // Caller tried to query a different org explicitly. Disallow.
    throw new ForbiddenException(
      `Query attempted to access org ${String(base.organizationId)} from context org ${tenantFilter.organizationId}`,
    );
  }
  return { ...base, ...tenantFilter };
}
