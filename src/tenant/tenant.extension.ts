import { Prisma } from '@prisma/client';
import { TenantContextService } from './tenant-context.service';
import { TenantFlagService } from './tenant-flag.service';
import { isTenantBypass, runWithTenantBypass } from './tenant-bypass.helper';
import type { ClsService } from 'nestjs-cls';
import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

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

/** PascalCase model name -> camelCase Prisma client accessor. */
function modelToAccessor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
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
 * 3. The model is not in `TENANT_SCOPED_MODELS` — global models pass through.
 *
 * Safety rule (refuses the call rather than leaking):
 *   If the model IS tenant-scoped, the flag IS on, no bypass is active, AND
 *   no orgId is present in the context — we throw rather than silently
 *   returning all rows. This catches bugs in the interceptor wiring.
 *
 * Operation-specific guarantees:
 * - findMany / count / aggregate / groupBy / findFirst / findFirstOrThrow /
 *   updateMany / deleteMany: org filter merged into `where` via AND.
 * - findUnique: query runs unfiltered, then the returned row's organizationId
 *   is compared against the current org; mismatch returns null (masks as
 *   "not found"). Same behavior for findUniqueOrThrow which raises P2025.
 * - update / delete: a pre-check loads the row with a tenant-bypass findUnique
 *   to verify it belongs to the current org. Cross-org targets throw
 *   NotFoundException, matching Prisma's normal P2025 surface area. Two
 *   roundtrips per call is the cost of preserving the original return-type
 *   contract.
 * - create: organizationId is auto-injected from the context; if the caller
 *   passed a different one, throws ForbiddenException.
 *
 * Factory form (`Prisma.defineExtension((client) => client.$extends(...))`)
 * gives us re-entrant access to the extended client. We rely on this for the
 * findUnique pre-check inside update/delete.
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

  return Prisma.defineExtension((client) => {
    /**
     * Pre-check used by update/delete. Loads `{organizationId}` for the row
     * matching `where`, bypassing the extension to avoid recursion. Returns
     * the orgId or throws NotFoundException if no row exists.
     */
    const loadOwnerOrgId = async (
      model: string,
      where: unknown,
    ): Promise<string> => {
      const accessor = (client as Record<string, any>)[modelToAccessor(model)];
      const row = await runWithTenantBypass(cls, () =>
        accessor.findUnique({
          where,
          select: { organizationId: true },
        }),
      );
      if (!row) {
        throw new NotFoundException(`${model} not found`);
      }
      return row.organizationId as string;
    };

    return client.$extends({
      name: 'obsid-tenant-scope',
      query: {
        $allModels: {
          async findMany({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            args.where = mergeWhere(args.where, orgId);
            return query(args);
          },
          async findFirst({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            args.where = mergeWhere(args.where, orgId);
            return query(args);
          },
          async findFirstOrThrow({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            args.where = mergeWhere(args.where, orgId);
            return query(args);
          },
          async findUnique({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            const result = await query(args);
            if (
              result &&
              (result as Record<string, unknown>).organizationId !== orgId
            ) {
              return null;
            }
            return result;
          },
          async findUniqueOrThrow({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            const result = await query(args);
            if (
              !result ||
              (result as Record<string, unknown>).organizationId !== orgId
            ) {
              throw new NotFoundException(`${model} not found`);
            }
            return result;
          },
          async count({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            args.where = mergeWhere(args.where, orgId);
            return query(args);
          },
          async aggregate({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            args.where = mergeWhere(args.where, orgId);
            return query(args);
          },
          async groupBy({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            args.where = mergeWhere(args.where, orgId);
            return query(args);
          },
          async create({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            if (
              args.data &&
              typeof args.data === 'object' &&
              !Array.isArray(args.data)
            ) {
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
            if (
              args.data &&
              typeof args.data === 'object' &&
              !Array.isArray(args.data)
            ) {
              const data = args.data as Record<string, unknown>;
              if (
                data.organizationId !== undefined &&
                data.organizationId !== orgId
              ) {
                throw new ForbiddenException(
                  `Cannot move ${model} to org ${String(data.organizationId)} from context org ${orgId}`,
                );
              }
            }
            // Pre-check: confirm the target row belongs to current org. We
            // use bypass to skip the extension on the read; otherwise it
            // would recurse into this same findUnique handler.
            const ownerOrg = await loadOwnerOrgId(model!, args.where);
            if (ownerOrg !== orgId) {
              throw new NotFoundException(`${model} not found`);
            }
            return query(args);
          },
          async updateMany({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            args.where = mergeWhere(args.where, orgId);
            return query(args);
          },
          async upsert({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            // Defense on create data
            if (
              args.create &&
              typeof args.create === 'object' &&
              !Array.isArray(args.create)
            ) {
              const data = args.create as Record<string, unknown>;
              if (data.organizationId === undefined) {
                data.organizationId = orgId;
              } else if (data.organizationId !== orgId) {
                throw new ForbiddenException(
                  `Cannot upsert ${model} in org ${String(data.organizationId)} from context org ${orgId}`,
                );
              }
            }
            // Defense on update data
            if (
              args.update &&
              typeof args.update === 'object' &&
              !Array.isArray(args.update)
            ) {
              const data = args.update as Record<string, unknown>;
              if (
                data.organizationId !== undefined &&
                data.organizationId !== orgId
              ) {
                throw new ForbiddenException(
                  `Cannot move ${model} to org ${String(data.organizationId)} from context org ${orgId}`,
                );
              }
            }
            return query(args);
          },
          async createMany({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            // Auto-set organizationId on each item; reject cross-org items.
            if (args.data && Array.isArray(args.data)) {
              for (const item of args.data as Array<Record<string, unknown>>) {
                if (item.organizationId === undefined) {
                  item.organizationId = orgId;
                } else if (item.organizationId !== orgId) {
                  throw new ForbiddenException(
                    `Cannot createMany ${model} with cross-org item (${String(item.organizationId)})`,
                  );
                }
              }
            } else if (args.data && typeof args.data === 'object') {
              const item = args.data as Record<string, unknown>;
              if (item.organizationId === undefined) {
                item.organizationId = orgId;
              } else if (item.organizationId !== orgId) {
                throw new ForbiddenException(
                  `Cannot createMany ${model} with cross-org data`,
                );
              }
            }
            return query(args);
          },
          async delete({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            const ownerOrg = await loadOwnerOrgId(model!, args.where);
            if (ownerOrg !== orgId) {
              throw new NotFoundException(`${model} not found`);
            }
            return query(args);
          },
          async deleteMany({ model, operation, args, query }) {
            if (shouldBypass(model)) return query(args);
            const orgId = requireOrgId(model!, operation);
            args.where = mergeWhere(args.where, orgId);
            return query(args);
          },
        },
      },
    });
  });
}

/**
 * Merges the tenant filter into an existing `where` clause defensively, even
 * when the caller passed nested AND/OR/NOT operators. The merge always wraps:
 *
 *   { AND: [<existing>, { organizationId: <orgId> }] }
 *
 * so that no nested OR can introduce a row from a foreign org. If the caller
 * explicitly set `organizationId` at the top level to a different org, the
 * call is rejected.
 */
function mergeWhere(
  existing: unknown,
  orgId: string,
): Record<string, unknown> {
  const tenantFilter = { organizationId: orgId };

  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
    return tenantFilter;
  }

  const base = existing as Record<string, unknown>;

  // Loud rejection if the caller is explicitly trying to query a different org.
  if (
    base.organizationId !== undefined &&
    base.organizationId !== orgId
  ) {
    throw new ForbiddenException(
      `Query attempted to access org ${String(base.organizationId)} from context org ${orgId}`,
    );
  }

  // Always wrap in AND so that nested OR/NOT branches in the existing clause
  // cannot shadow the org filter via Prisma's boolean semantics.
  return { AND: [base, tenantFilter] };
}
