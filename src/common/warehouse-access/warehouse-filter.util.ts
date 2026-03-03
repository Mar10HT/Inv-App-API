/**
 * Generates Prisma where clause for warehouse-based filtering.
 * Returns empty object if warehouseIds is null (unrestricted access).
 */
export function warehouseFilter(
  warehouseIds: string[] | null,
  field = 'warehouseId',
): Record<string, any> {
  if (warehouseIds === null) return {};
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
  if (warehouseIds === null) return {};
  return {
    OR: fields.map((field) => ({ [field]: { in: warehouseIds } })),
  };
}
