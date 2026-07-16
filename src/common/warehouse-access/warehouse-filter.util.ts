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
