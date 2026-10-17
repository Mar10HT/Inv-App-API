import { InventoryStatus, ItemType } from '@prisma/client';

export interface InventoryStatusInput {
  itemType: ItemType;
  quantity: number;
  minQuantity: number;
  assignedToUserId?: string | null;
}

/**
 * Single source of truth for an item's stock status.
 *
 * UNIQUE items are tracked one unit at a time, so their minimum quantity is
 * meaningless: they are IN_USE when assigned, IN_STOCK when the unit is here
 * and OUT_OF_STOCK when it is not — never LOW_STOCK.
 */
export function computeInventoryStatus(
  item: InventoryStatusInput,
): InventoryStatus {
  if (item.itemType === ItemType.UNIQUE) {
    if (item.assignedToUserId) return InventoryStatus.IN_USE;
    return item.quantity >= 1
      ? InventoryStatus.IN_STOCK
      : InventoryStatus.OUT_OF_STOCK;
  }

  if (item.quantity <= 0) return InventoryStatus.OUT_OF_STOCK;
  if (item.quantity <= item.minQuantity) return InventoryStatus.LOW_STOCK;
  return InventoryStatus.IN_STOCK;
}
