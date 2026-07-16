import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import {
  AlertType,
  InventoryStatus,
  type StockAlert,
  type InventoryItem,
  type Warehouse,
} from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';

describe('AlertsService', () => {
  let service: AlertsService;
  let prisma: DeepMockProxy<PrismaService>;

  const mockWarehouse = {
    id: 'wh-1',
    name: 'Main Warehouse',
  } as unknown as Warehouse;

  const mockItem = {
    id: 'item-1',
    name: 'Test Item',
    quantity: 5,
    minQuantity: 10,
    status: InventoryStatus.LOW_STOCK,
    warehouseId: 'wh-1',
    warehouse: mockWarehouse,
    deletedAt: null,
  } as unknown as InventoryItem;

  const mockAlert = {
    id: 'alert-1',
    itemId: 'item-1',
    type: AlertType.LOW_STOCK,
    threshold: 10,
    currentQty: 5,
    notified: false,
    notifiedAt: null,
    resolvedAt: null,
    createdAt: new Date(),
    item: { ...mockItem, warehouse: mockWarehouse, supplier: null },
  } as unknown as StockAlert;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    // updateMany must return { count: N } — the service reads resolvedAlerts.count
    prisma.stockAlert.updateMany.mockResolvedValue({ count: 0 });
    // count must return a number — the service performs arithmetic on the result
    prisma.stockAlert.count.mockResolvedValue(0);

    const mockEventsService = {
      emitInventoryChange: jest.fn(),
      emitAlertChange: jest.fn(),
    };

    const mockPushNotificationsService = {
      send: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: mockEventsService },
        {
          provide: PushNotificationsService,
          useValue: mockPushNotificationsService,
        },
      ],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns paginated alerts', async () => {
      prisma.stockAlert.findMany.mockResolvedValue([mockAlert]);
      prisma.stockAlert.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('uses default pagination when none provided', async () => {
      prisma.stockAlert.findMany.mockResolvedValue([]);
      prisma.stockAlert.count.mockResolvedValue(0);

      const result = await service.findAll();

      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.stockAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('findActive', () => {
    it('returns only unresolved alerts', async () => {
      prisma.stockAlert.findMany.mockResolvedValue([mockAlert]);
      prisma.stockAlert.count.mockResolvedValue(1);

      const result = await service.findActive();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.stockAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { resolvedAt: null } }),
      );
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findByType', () => {
    it('filters alerts by type', async () => {
      prisma.stockAlert.findMany.mockResolvedValue([mockAlert]);
      prisma.stockAlert.count.mockResolvedValue(1);

      await service.findByType(AlertType.LOW_STOCK);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.stockAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: AlertType.LOW_STOCK, resolvedAt: null },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns alert by id', async () => {
      prisma.stockAlert.findUnique.mockResolvedValue(mockAlert);

      const result = await service.findOne('alert-1');

      expect(result).toEqual(mockAlert);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.stockAlert.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'alert-1' } }),
      );
    });

    it('throws NotFoundException when alert not found', async () => {
      prisma.stockAlert.findUnique.mockResolvedValue(null);

      await expect(service.findOne('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('markAsNotified', () => {
    it('marks alert as notified', async () => {
      const notifiedAlert = {
        ...mockAlert,
        notified: true,
        notifiedAt: new Date(),
      } as unknown as StockAlert;
      prisma.stockAlert.findUnique.mockResolvedValue(mockAlert);
      prisma.stockAlert.update.mockResolvedValue(notifiedAlert);

      const result = await service.markAsNotified('alert-1');

      expect(result.notified).toBe(true);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.stockAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'alert-1' },
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ notified: true }),
        }),
      );
    });

    it('throws NotFoundException when alert not found', async () => {
      prisma.stockAlert.findUnique.mockResolvedValue(null);

      await expect(service.markAsNotified('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('resolve', () => {
    it('resolves an alert by setting resolvedAt', async () => {
      const resolvedAlert = {
        ...mockAlert,
        resolvedAt: new Date(),
      } as unknown as StockAlert;
      prisma.stockAlert.findUnique.mockResolvedValue(mockAlert);
      prisma.stockAlert.update.mockResolvedValue(resolvedAlert);

      const result = await service.resolve('alert-1');

      expect(result.resolvedAt).not.toBeNull();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.stockAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'alert-1' },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
        }),
      );
    });

    it('throws NotFoundException when alert not found', async () => {
      prisma.stockAlert.findUnique.mockResolvedValue(null);

      await expect(service.resolve('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getStats', () => {
    it('returns alert stats by type', async () => {
      prisma.stockAlert.count
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(8) // active
        .mockResolvedValueOnce(3) // lowStock
        .mockResolvedValueOnce(2) // outOfStock
        .mockResolvedValueOnce(1) // expiringItems
        .mockResolvedValueOnce(4); // notified

      const result = await service.getStats();

      expect(result.total).toBe(20);
      expect(result.active).toBe(8);
      expect(result.resolved).toBe(12);
      expect(result.byType.lowStock).toBe(3);
      expect(result.byType.outOfStock).toBe(2);
      expect(result.byType.expiringItems).toBe(1);
      expect(result.notified).toBe(4);
      expect(result.pendingNotification).toBe(4);
    });
  });

  describe('checkLowStock', () => {
    it('creates alert for low stock item without existing alert', async () => {
      prisma.inventoryItem.findMany
        .mockResolvedValueOnce([mockItem]) // low stock items
        .mockResolvedValueOnce([]); // expiring items

      // findMany for existing stock alerts (empty = no existing alert)
      prisma.stockAlert.findMany
        .mockResolvedValueOnce([]) // existing stock alerts
        .mockResolvedValueOnce([]); // existing expiry alerts
      prisma.stockAlert.create.mockResolvedValue(mockAlert);

      await service.checkLowStock();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.stockAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            itemId: 'item-1',
            type: AlertType.LOW_STOCK,
          }),
        }),
      );
    });

    it('creates OUT_OF_STOCK alert when quantity is 0', async () => {
      const outOfStockItem = {
        ...mockItem,
        quantity: 0,
        status: InventoryStatus.OUT_OF_STOCK,
      } as unknown as InventoryItem;

      prisma.inventoryItem.findMany
        .mockResolvedValueOnce([outOfStockItem])
        .mockResolvedValueOnce([]);

      prisma.stockAlert.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      prisma.stockAlert.create.mockResolvedValue({
        ...mockAlert,
        type: AlertType.OUT_OF_STOCK,
      } as unknown as StockAlert);

      await service.checkLowStock();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.stockAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ type: AlertType.OUT_OF_STOCK }),
        }),
      );
    });

    it('upgrades existing LOW_STOCK alert to OUT_OF_STOCK when quantity hits 0', async () => {
      const outOfStockItem = {
        ...mockItem,
        quantity: 0,
        status: InventoryStatus.OUT_OF_STOCK,
      } as unknown as InventoryItem;
      const existingAlert = {
        id: 'alert-1',
        itemId: 'item-1',
        type: AlertType.LOW_STOCK,
      } as unknown as StockAlert;

      prisma.inventoryItem.findMany
        .mockResolvedValueOnce([outOfStockItem])
        .mockResolvedValueOnce([]);

      prisma.stockAlert.findMany
        .mockResolvedValueOnce([existingAlert])
        .mockResolvedValueOnce([]);
      prisma.stockAlert.update.mockResolvedValue({
        ...existingAlert,
        type: AlertType.OUT_OF_STOCK,
      } as unknown as StockAlert);

      await service.checkLowStock();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.stockAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            type: AlertType.OUT_OF_STOCK,
            currentQty: 0,
          }),
        }),
      );
    });

    it('skips creating alert when unresolved alert already exists', async () => {
      const existingAlert = {
        id: 'alert-1',
        itemId: 'item-1',
        type: AlertType.LOW_STOCK,
      } as unknown as StockAlert;

      prisma.inventoryItem.findMany
        .mockResolvedValueOnce([mockItem])
        .mockResolvedValueOnce([]);

      prisma.stockAlert.findMany
        .mockResolvedValueOnce([existingAlert])
        .mockResolvedValueOnce([]);

      await service.checkLowStock();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.stockAlert.create).not.toHaveBeenCalled();
    });
  });
});
