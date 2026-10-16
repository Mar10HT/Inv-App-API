import { BadRequestException } from '@nestjs/common';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { takeStock } from './stock.util';
import { PrismaService } from '../prisma/prisma.service';

describe('takeStock', () => {
  let tx: DeepMockProxy<PrismaService>;

  beforeEach(() => {
    tx = mockDeep<PrismaService>();
  });

  it('decrements only where enough units are left, in one statement', async () => {
    tx.inventoryItem.updateMany.mockResolvedValue({ count: 1 });

    await takeStock(tx, 'item-1', 3);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(tx.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', deletedAt: null, quantity: { gte: 3 } },
      data: { quantity: { decrement: 3 } },
    });
  });

  it('reports what is left when the units are not there', async () => {
    tx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });
    tx.inventoryItem.findFirst.mockResolvedValue({
      id: 'item-1',
      name: 'Cable',
      quantity: 2,
    } as never);

    await expect(takeStock(tx, 'item-1', 3)).rejects.toMatchObject({
      response: {
        code: 'INSUFFICIENT_STOCK',
        params: { item: 'Cable', available: 2, requested: 3 },
      },
    });
  });

  it('says the item is gone when it was deleted', async () => {
    tx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });
    tx.inventoryItem.findFirst.mockResolvedValue(null);

    await expect(takeStock(tx, 'item-1', 3)).rejects.toMatchObject({
      response: { code: 'ITEM_NO_LONGER_AVAILABLE' },
    });
  });

  it('lets the caller choose the error for a shortage', async () => {
    tx.inventoryItem.updateMany.mockResolvedValue({ count: 0 });
    tx.inventoryItem.findFirst.mockResolvedValue({
      id: 'item-1',
      name: 'Cable',
      quantity: 0,
    } as never);
    const custom = new BadRequestException('custom');

    await expect(takeStock(tx, 'item-1', 3, () => custom)).rejects.toBe(custom);
  });
});
