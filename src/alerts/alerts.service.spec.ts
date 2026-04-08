import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { AlertType, InventoryStatus } from '@prisma/client';

describe('AlertsService', () => {
  let service: AlertsService;
  let prisma: jest.Mocked<PrismaService>;

  const mockWarehouse = { id: 'wh-1', name: 'Main Warehouse' };

  const mockItem = {
    id: 'item-1',
    name: 'Test Item',
    quantity: 5,
    minQuantity: 10,
    status: InventoryStatus.LOW_STOCK,
    warehouseId: 'wh-1',
    warehouse: mockWarehouse,
    deletedAt: null,
  };

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
  };

  beforeEach(async () => {
    const mockPrismaService = {
      inventoryItem: {
        findMany: jest.fn(),
      },
      stockAlert: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const mockEventsService = {
      emitInventoryChange: jest.fn(),
      emitAlertChange: jest.fn(),
    };

    const mockPushNotificationsService = {
      sendToAll: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventsService, useValue: mockEventsService },
        { provide: PushNotificationsService, useValue: mockPushNotificationsService },
      ],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('returns paginated alerts', async () => {
      (prisma.stockAlert.findMany as jest.Mock).mockResolvedValue([mockAlert]);
      (prisma.stockAlert.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('uses default pagination when none provided', async () => {
      (prisma.stockAlert.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.stockAlert.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAll();

      expect(prisma.stockAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('findActive', () => {
    it('returns only unresolved alerts', async () => {
      (prisma.stockAlert.findMany as jest.Mock).mockResolvedValue([mockAlert]);
      (prisma.stockAlert.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findActive();

      expect(prisma.stockAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { resolvedAt: null } }),
      );
      expect(result.data).toHaveLength(1);
    });
  });

  describe('findByType', () => {
    it('filters alerts by type', async () => {
      (prisma.stockAlert.findMany as jest.Mock).mockResolvedValue([mockAlert]);
      (prisma.stockAlert.count as jest.Mock).mockResolvedValue(1);

      await service.findByType(AlertType.LOW_STOCK);

      expect(prisma.stockAlert.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { type: AlertType.LOW_STOCK, resolvedAt: null },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns alert by id', async () => {
      (prisma.stockAlert.findUnique as jest.Mock).mockResolvedValue(mockAlert);

      const result = await service.findOne('alert-1');

      expect(result).toEqual(mockAlert);
      expect(prisma.stockAlert.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'alert-1' } }),
      );
    });

    it('throws NotFoundException when alert not found', async () => {
      (prisma.stockAlert.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAsNotified', () => {
    it('marks alert as notified', async () => {
      const notifiedAlert = { ...mockAlert, notified: true, notifiedAt: new Date() };
      (prisma.stockAlert.findUnique as jest.Mock).mockResolvedValue(mockAlert);
      (prisma.stockAlert.update as jest.Mock).mockResolvedValue(notifiedAlert);

      const result = await service.markAsNotified('alert-1');

      expect(result.notified).toBe(true);
      expect(prisma.stockAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'alert-1' },
          data: expect.objectContaining({ notified: true }),
        }),
      );
    });

    it('throws NotFoundException when alert not found', async () => {
      (prisma.stockAlert.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.markAsNotified('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolve', () => {
    it('resolves an alert by setting resolvedAt', async () => {
      const resolvedAlert = { ...mockAlert, resolvedAt: new Date() };
      (prisma.stockAlert.findUnique as jest.Mock).mockResolvedValue(mockAlert);
      (prisma.stockAlert.update as jest.Mock).mockResolvedValue(resolvedAlert);

      const result = await service.resolve('alert-1');

      expect(result.resolvedAt).not.toBeNull();
      expect(prisma.stockAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'alert-1' },
          data: expect.objectContaining({ resolvedAt: expect.any(Date) }),
        }),
      );
    });

    it('throws NotFoundException when alert not found', async () => {
      (prisma.stockAlert.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.resolve('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('returns alert stats by type', async () => {
      (prisma.stockAlert.count as jest.Mock)
        .mockResolvedValueOnce(20)   // total
        .mockResolvedValueOnce(8)    // active
        .mockResolvedValueOnce(3)    // lowStock
        .mockResolvedValueOnce(2)    // outOfStock
        .mockResolvedValueOnce(1)    // expiringItems
        .mockResolvedValueOnce(4);   // notified

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
      (prisma.inventoryItem.findMany as jest.Mock)
        .mockResolvedValueOnce([mockItem])  // low stock items
        .mockResolvedValueOnce([]);          // expiring items

      // findMany for existing stock alerts (empty = no existing alert)
      (prisma.stockAlert.findMany as jest.Mock)
        .mockResolvedValueOnce([])   // existing stock alerts
        .mockResolvedValueOnce([]);  // existing expiry alerts
      (prisma.stockAlert.create as jest.Mock).mockResolvedValue(mockAlert);

      await service.checkLowStock();

      expect(prisma.stockAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            itemId: 'item-1',
            type: AlertType.LOW_STOCK,
          }),
        }),
      );
    });

    it('creates OUT_OF_STOCK alert when quantity is 0', async () => {
      const outOfStockItem = { ...mockItem, quantity: 0, status: InventoryStatus.OUT_OF_STOCK };

      (prisma.inventoryItem.findMany as jest.Mock)
        .mockResolvedValueOnce([outOfStockItem])
        .mockResolvedValueOnce([]);

      (prisma.stockAlert.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      (prisma.stockAlert.create as jest.Mock).mockResolvedValue({ ...mockAlert, type: AlertType.OUT_OF_STOCK });

      await service.checkLowStock();

      expect(prisma.stockAlert.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: AlertType.OUT_OF_STOCK }),
        }),
      );
    });

    it('upgrades existing LOW_STOCK alert to OUT_OF_STOCK when quantity hits 0', async () => {
      const outOfStockItem = { ...mockItem, quantity: 0, status: InventoryStatus.OUT_OF_STOCK };
      const existingAlert = { id: 'alert-1', itemId: 'item-1', type: AlertType.LOW_STOCK };

      (prisma.inventoryItem.findMany as jest.Mock)
        .mockResolvedValueOnce([outOfStockItem])
        .mockResolvedValueOnce([]);

      (prisma.stockAlert.findMany as jest.Mock)
        .mockResolvedValueOnce([existingAlert])
        .mockResolvedValueOnce([]);
      (prisma.stockAlert.update as jest.Mock).mockResolvedValue({ ...existingAlert, type: AlertType.OUT_OF_STOCK });

      await service.checkLowStock();

      expect(prisma.stockAlert.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ type: AlertType.OUT_OF_STOCK, currentQty: 0 }),
        }),
      );
    });

    it('skips creating alert when unresolved alert already exists', async () => {
      const existingAlert = { id: 'alert-1', itemId: 'item-1', type: AlertType.LOW_STOCK };

      (prisma.inventoryItem.findMany as jest.Mock)
        .mockResolvedValueOnce([mockItem])
        .mockResolvedValueOnce([]);

      (prisma.stockAlert.findMany as jest.Mock)
        .mockResolvedValueOnce([existingAlert])
        .mockResolvedValueOnce([]);

      await service.checkLowStock();

      expect(prisma.stockAlert.create).not.toHaveBeenCalled();
    });
  });
});
