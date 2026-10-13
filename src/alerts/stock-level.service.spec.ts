import { Test } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { InventoryStatus, ItemType } from '@prisma/client';
import { StockLevelService } from './stock-level.service';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../prisma/prisma.service';

describe('StockLevelService', () => {
  let service: StockLevelService;
  let prisma: {
    inventoryItem: { findMany: jest.Mock; updateMany: jest.Mock };
  };
  let alerts: { checkLowStock: jest.Mock };
  let cache: { clear: jest.Mock };

  beforeEach(async () => {
    prisma = {
      inventoryItem: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest
          .fn()
          .mockImplementation(
            ({ where }: { where: { id: { in: string[] } } }) =>
              Promise.resolve({ count: where.id.in.length }),
          ),
      },
    };
    alerts = { checkLowStock: jest.fn().mockResolvedValue(undefined) };
    cache = { clear: jest.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        StockLevelService,
        { provide: PrismaService, useValue: prisma },
        { provide: AlertsService, useValue: alerts },
        { provide: CACHE_MANAGER, useValue: cache },
      ],
    }).compile();

    service = module.get(StockLevelService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('syncStatuses', () => {
    it('updates only the items whose stored status no longer matches their quantity', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([
        // sold below its minimum, still marked IN_STOCK
        {
          id: 'a',
          itemType: ItemType.BULK,
          quantity: 4,
          minQuantity: 10,
          assignedToUserId: null,
          status: InventoryStatus.IN_STOCK,
        },
        // already correct
        {
          id: 'b',
          itemType: ItemType.BULK,
          quantity: 50,
          minQuantity: 10,
          assignedToUserId: null,
          status: InventoryStatus.IN_STOCK,
        },
        // unique unit wrongly flagged as low stock
        {
          id: 'c',
          itemType: ItemType.UNIQUE,
          quantity: 1,
          minQuantity: 1,
          assignedToUserId: null,
          status: InventoryStatus.LOW_STOCK,
        },
      ]);

      const updated = await service.syncStatuses();

      expect(updated).toBe(2);
      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['a'] } },
        data: { status: InventoryStatus.LOW_STOCK },
      });
      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['c'] } },
        data: { status: InventoryStatus.IN_STOCK },
      });
      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledTimes(2);
    });

    it('skips deleted items', async () => {
      await service.syncStatuses();
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { deletedAt: null } }),
      );
    });
  });

  describe('refreshNow', () => {
    it('syncs statuses before checking alerts, then clears the stats cache', async () => {
      const order: string[] = [];
      prisma.inventoryItem.findMany.mockImplementation(() => {
        order.push('sync');
        return Promise.resolve([]);
      });
      alerts.checkLowStock.mockImplementation(() => {
        order.push('alerts');
        return Promise.resolve();
      });
      cache.clear.mockImplementation(() => {
        order.push('cache');
        return Promise.resolve();
      });

      await service.refreshNow();

      expect(order).toEqual(['sync', 'alerts', 'cache']);
    });

    it('logs instead of throwing when the refresh fails', async () => {
      prisma.inventoryItem.findMany.mockRejectedValue(new Error('db down'));
      await expect(service.refreshNow()).resolves.toBeUndefined();
      expect(alerts.checkLowStock).not.toHaveBeenCalled();
    });
  });

  describe('scheduleRefresh', () => {
    it('coalesces calls made close together into one refresh', () => {
      jest.useFakeTimers();
      const refresh = jest.spyOn(service, 'refreshNow').mockResolvedValue();

      service.scheduleRefresh();
      service.scheduleRefresh();
      service.scheduleRefresh();
      expect(refresh).not.toHaveBeenCalled();

      jest.advanceTimersByTime(StockLevelService.DEBOUNCE_MS);
      expect(refresh).toHaveBeenCalledTimes(1);
    });
  });
});
