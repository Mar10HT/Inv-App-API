import { ForbiddenException } from '@nestjs/common';

/**
 * Generates Prisma where clause for warehouse-based filtering.
 * Returns empty object if warehouseIds is null (unrestricted access).
 */
export function warehouseFilter(
  warehouseIds: string[] | null,
  field = 'warehouseId',
): Record<string, any> {
  if (warehouseIds == null) return {};
  return { [field]: { in: warehouseIds } };
}

/**
 * Generates Prisma OR clause for entities with multiple warehouse fields
 * (e.g. transactions with sourceWarehouseId and destinationWarehouseId).
 * Returns empty object if warehouseIds is null (unrestricted access).
 */
export function warehouseFilterMultiField(
  warehouseIds: string[] | null,
  fields: string[],
): Record<string, any> {
  if (warehouseIds == null) return {};
  return {
    OR: fields.map((field) => ({ [field]: { in: warehouseIds } })),
  };
}

/**
 * Resolve the effective warehouse scope for a request.
 *
 * - If no `selectedWarehouseId` is provided, the user's full access list is returned (current behavior).
 * - If `selectedWarehouseId` is provided, it must be in the user's access list (unless the user
 *   has unrestricted access, i.e. `userWarehouseIds == null`).
 *
 * Throws if the user does not have access to the requested warehouse.
 */
export function resolveWarehouseScope(
  userWarehouseIds: string[] | null,
  selectedWarehouseId?: string | null,
): string[] | null {
  if (!selectedWarehouseId) return userWarehouseIds;
  if (userWarehouseIds === null) return [selectedWarehouseId];
  if (!userWarehouseIds.includes(selectedWarehouseId)) {
    throw new Error('FORBIDDEN_WAREHOUSE');
  }
  return [selectedWarehouseId];
}

/**
 * warehouseFilter for the warehouses a user can see, narrowed to the one they
 * picked in a list filter. Spreading `{ warehouseId: picked }` after
 * warehouseFilter() would replace the access restriction instead of narrowing
 * it, so a user limited to W1 could list W2 by asking for it; a warehouse
 * outside their access is refused here instead.
 */
export function selectedWarehouseFilter(
  userWarehouseIds: string[] | null | undefined,
  selectedWarehouseId?: string | null,
): Record<string, any> {
  try {
    return warehouseFilter(
      resolveWarehouseScope(userWarehouseIds ?? null, selectedWarehouseId),
    );
  } catch {
    throw new ForbiddenException('You do not have access to this warehouse');
  }
}
