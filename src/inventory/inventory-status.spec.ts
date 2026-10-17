import { InventoryStatus, ItemType } from '@prisma/client';
import { computeInventoryStatus } from './inventory-status';

describe('computeInventoryStatus', () => {
  describe('BULK items', () => {
    const bulk = (quantity: number, minQuantity = 10) =>
      computeInventoryStatus({
        itemType: ItemType.BULK,
        quantity,
        minQuantity,
      });

    it('is OUT_OF_STOCK at zero', () => {
      expect(bulk(0)).toBe(InventoryStatus.OUT_OF_STOCK);
    });

    it('is LOW_STOCK at or below the minimum', () => {
      expect(bulk(10)).toBe(InventoryStatus.LOW_STOCK);
      expect(bulk(3)).toBe(InventoryStatus.LOW_STOCK);
    });

    it('is IN_STOCK above the minimum', () => {
      expect(bulk(11)).toBe(InventoryStatus.IN_STOCK);
    });

    it('treats a minimum of 0 as "never low", not as the default of 10', () => {
      expect(bulk(5, 0)).toBe(InventoryStatus.IN_STOCK);
    });

    it('ignores an assignee', () => {
      expect(
        computeInventoryStatus({
          itemType: ItemType.BULK,
          quantity: 50,
          minQuantity: 10,
          assignedToUserId: 'u1',
        }),
      ).toBe(InventoryStatus.IN_STOCK);
    });
  });

  describe('UNIQUE items', () => {
    const unique = (quantity: number, assignedToUserId?: string) =>
      computeInventoryStatus({
        itemType: ItemType.UNIQUE,
        quantity,
        minQuantity: 1,
        assignedToUserId,
      });

    it('is never LOW_STOCK, even when its single unit equals the minimum', () => {
      expect(unique(1)).toBe(InventoryStatus.IN_STOCK);
    });

    it('is OUT_OF_STOCK when the unit is gone', () => {
      expect(unique(0)).toBe(InventoryStatus.OUT_OF_STOCK);
    });

    it('is IN_USE when assigned to someone', () => {
      expect(unique(1, 'u1')).toBe(InventoryStatus.IN_USE);
    });
  });
});
