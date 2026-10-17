import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { apiError } from '../common/errors/api-error';

interface ShortItem {
  id: string;
  name: string;
  quantity: number;
}

/**
 * Takes `quantity` units of an item, only if that many are there. The check
 * and the decrement are one UPDATE, so two transactions selling the last
 * units at the same time can't both succeed: Postgres re-checks
 * `quantity >= n` after the first one commits and the second updates
 * nothing. A read-then-decrement does not give that guarantee under READ
 * COMMITTED, even inside a transaction.
 *
 * Throws INSUFFICIENT_STOCK (or what `onShortage` returns) when the units
 * aren't there, and ITEM_NO_LONGER_AVAILABLE when the item is gone.
 */
export async function takeStock(
  tx: Prisma.TransactionClient,
  itemId: string,
  quantity: number,
  onShortage?: (item: ShortItem) => Error,
): Promise<void> {
  const { count } = await tx.inventoryItem.updateMany({
    where: { id: itemId, deletedAt: null, quantity: { gte: quantity } },
    data: { quantity: { decrement: quantity } },
  });
  if (count === 1) return;

  const item = await tx.inventoryItem.findFirst({
    where: { id: itemId, deletedAt: null },
    select: { id: true, name: true, quantity: true },
  });
  if (!item) {
    throw new BadRequestException(
      apiError(
        'ITEM_NO_LONGER_AVAILABLE',
        `Item ${itemId} is no longer available`,
        { item: itemId },
      ),
    );
  }
  throw (
    onShortage?.(item) ??
    new BadRequestException(
      apiError(
        'INSUFFICIENT_STOCK',
        `Insufficient quantity for item ${item.name}. Available: ${item.quantity}, Requested: ${quantity}`,
        { item: item.name, available: item.quantity, requested: quantity },
      ),
    )
  );
}
