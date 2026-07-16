import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { InventoryService } from './inventory.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EventsService } from '../events/events.service';
import { SearchService } from '../common/search/search.service';
import {
  InventoryStatus,
  ItemType,
  Currency,
  type InventoryItem,
  type Warehouse,
} from '@prisma/client';

describe('InventoryService', () => {
  let service: InventoryService;
  let prisma: DeepMockProxy<PrismaService>;
  let auditService: { log: jest.Mock };

  // Fixtures deliberately only populate the fields each test actually reads;
  // cast once here (rather than at each mockResolvedValue call site) now that
  // `prisma` is a fully-typed DeepMockProxy<PrismaService>.
  const mockWarehouse = {
    id: 'warehouse-123',
    name: 'Main Warehouse',
    location: 'Building A',
    description: 'Main storage',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Warehouse;

  const mockInventoryItem = {
    id: 'item-123',
    name: 'Test Item',
    description: 'Test description',
    quantity: 100,
    minQuantity: 10,
    category: 'Electronics',
    status: InventoryStatus.IN_STOCK,
    price: 29.99,
    currency: Currency.USD,
    sku: 'SKU-001',
    barcode: null,
    imageUrl: null,
    itemType: ItemType.BULK,
    serviceTag: null,
    serialNumber: null,
    warehouseId: 'warehouse-123',
    supplierId: null,
    assignedToUserId: null,
    assignedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdById: 'user-123',
    warehouse: mockWarehouse,
    supplier: null,
    createdBy: { id: 'user-123', name: 'Admin', email: 'admin@test.com' },
    assignedToUser: null,
  } as unknown as InventoryItem;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    prisma.$queryRaw.mockResolvedValue([{ total: 0 }] as never);

    auditService = { log: jest.fn() };

    const mockCacheManager = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn().mockResolvedValue(undefined),
      // cache-manager v7's `Cache` type exposes `clear()`, not `reset()`
      // (see InventoryService.invalidateCache).
      clear: jest.fn().mockResolvedValue(undefined),
    };

    const mockEventsService = {
      emitInventoryChange: jest.fn(),
    };

    const mockSearchService = {
      syncItem: jest.fn().mockResolvedValue(undefined),
      removeItem: jest.fn().mockResolvedValue(undefined),
      searchInventory: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: auditService },
        { provide: CACHE_MANAGER, useValue: mockCacheManager },
        { provide: EventsService, useValue: mockEventsService },
        { provide: SearchService, useValue: mockSearchService },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a BULK inventory item successfully', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      prisma.inventoryItem.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.create.mockResolvedValue(mockInventoryItem);
      auditService.log.mockResolvedValue(undefined);

      const createDto = {
        name: 'Test Item',
        description: 'Test description',
        quantity: 100,
        category: 'Electronics',
        warehouseId: 'warehouse-123',
        price: 29.99,
        sku: 'SKU-001',
      };

      const result = await service.create(createDto);

      expect(result).toEqual(mockInventoryItem);
      // jest-mock-extended's DeepMockProxy methods are real jest.Mock
      // functions at runtime, but their static type doesn't carry that
      // through cleanly enough for this rule to recognize them as safe to
      // reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.warehouse.findUnique).toHaveBeenCalledWith({
        where: { id: 'warehouse-123' },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.create).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });

    it('should throw NotFoundException if warehouse does not exist', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(
        service.create({
          name: 'Test Item',
          quantity: 10,
          category: 'Electronics',
          warehouseId: 'nonexistent-warehouse',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if SKU already exists', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      prisma.inventoryItem.findUnique.mockResolvedValue(mockInventoryItem);

      await expect(
        service.create({
          name: 'Test Item',
          quantity: 10,
          category: 'Electronics',
          warehouseId: 'warehouse-123',
          sku: 'SKU-001',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if UNIQUE item has quantity > 1', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);

      await expect(
        service.create({
          name: 'Laptop',
          quantity: 5,
          category: 'Electronics',
          warehouseId: 'warehouse-123',
          itemType: ItemType.UNIQUE,
          serviceTag: 'SVC-001',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if UNIQUE item has no serviceTag or serialNumber', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);

      await expect(
        service.create({
          name: 'Laptop',
          quantity: 1,
          category: 'Electronics',
          warehouseId: 'warehouse-123',
          itemType: ItemType.UNIQUE,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should auto-calculate LOW_STOCK status when quantity <= minQuantity', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      prisma.inventoryItem.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.create.mockImplementation((args) => {
        return Promise.resolve({
          ...mockInventoryItem,
          ...args.data,
          status: args.data.status,
        });
      });
      auditService.log.mockResolvedValue(undefined);

      await service.create({
        name: 'Low Stock Item',
        quantity: 5,
        minQuantity: 10,
        category: 'Electronics',
        warehouseId: 'warehouse-123',
      });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: InventoryStatus.LOW_STOCK,
          }),
        }),
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated inventory items', async () => {
      const items = [mockInventoryItem];
      prisma.inventoryItem.findMany.mockResolvedValue(items);
      prisma.inventoryItem.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(items);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });

    it('should filter by category', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([]);
      prisma.inventoryItem.count.mockResolvedValue(0);

      await service.findAll({ category: 'Electronics' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            category: 'Electronics',
          }),
        }),
      );
    });

    it('should search by name', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([]);
      prisma.inventoryItem.count.mockResolvedValue(0);

      await service.findAll({ search: 'laptop' });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining()/arrayContaining() return type is
          // `any` in the installed @types/jest — a known, long-standing
          // typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            OR: expect.arrayContaining([
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
              expect.objectContaining({ name: expect.any(Object) }),
            ]),
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return an inventory item by ID', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(mockInventoryItem);

      const result = await service.findOne('item-123');

      expect(result).toEqual(mockInventoryItem);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.findUnique).toHaveBeenCalledWith({
        where: { id: 'item-123' },
        // jest's expect.any() return type is `any` in the installed
        // @types/jest — a known, long-standing typing gap.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        include: expect.any(Object),
      });
    });

    it('should throw NotFoundException if item does not exist', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update an inventory item', async () => {
      const updatedItem = { ...mockInventoryItem, name: 'Updated Item' };
      prisma.inventoryItem.findUnique.mockResolvedValue(mockInventoryItem);
      prisma.inventoryItem.findFirst.mockResolvedValue(null);
      prisma.inventoryItem.update.mockResolvedValue(updatedItem);

      const result = await service.update('item-123', { name: 'Updated Item' });

      expect(result.name).toBe('Updated Item');
    });

    it('should throw ConflictException if updating to existing SKU', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(mockInventoryItem);
      prisma.inventoryItem.findFirst.mockResolvedValue({
        ...mockInventoryItem,
        id: 'other-item',
        sku: 'EXISTING-SKU',
      });

      await expect(
        service.update('item-123', { sku: 'EXISTING-SKU' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should auto-update status when quantity changes', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue({
        ...mockInventoryItem,
        minQuantity: 10,
      });
      prisma.inventoryItem.update.mockImplementation((args) => {
        return Promise.resolve({
          ...mockInventoryItem,
          ...args.data,
        });
      });

      await service.update('item-123', { quantity: 0 });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: InventoryStatus.OUT_OF_STOCK,
          }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('should soft delete an inventory item', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(mockInventoryItem);
      prisma.inventoryItem.update.mockResolvedValue({
        ...mockInventoryItem,
        deletedAt: new Date(),
      });

      await service.remove('item-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-123' },
        // jest's expect.any() return type is `any` in the installed
        // @types/jest — a known, long-standing typing gap.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('getStats', () => {
    it('should return inventory statistics', async () => {
      prisma.inventoryItem.count
        .mockResolvedValueOnce(100) // total
        .mockResolvedValueOnce(80) // inStock
        .mockResolvedValueOnce(15) // lowStock
        .mockResolvedValueOnce(5) // outOfStock
        .mockResolvedValueOnce(0); // inUse

      prisma.$queryRaw.mockResolvedValue([{ total: 110 }] as never); // 10*5 + 20*3

      prisma.inventoryItem.groupBy.mockResolvedValueOnce([
        { category: 'Electronics', _count: { category: 50 } },
        { category: 'Furniture', _count: { category: 30 } },
      ]);

      prisma.warehouse.findMany.mockResolvedValue([
        { id: 'wh-1', name: 'Warehouse 1', _count: { inventoryItems: 60 } },
      ]);

      const result = await service.getStats();

      expect(result.total).toBe(100);
      expect(result.inStock).toBe(80);
      expect(result.lowStock).toBe(15);
      expect(result.outOfStock).toBe(5);
      expect(result.totalValue).toBe(110);
      expect(result.categories).toHaveLength(2);
      expect(result.locations).toHaveLength(1);
    });
  });

  describe('getLowStockItems', () => {
    it('should return items with LOW_STOCK or OUT_OF_STOCK status', async () => {
      const lowStockItems = [
        {
          ...mockInventoryItem,
          status: InventoryStatus.LOW_STOCK,
          quantity: 5,
        },
        {
          ...mockInventoryItem,
          id: 'item-456',
          status: InventoryStatus.OUT_OF_STOCK,
          quantity: 0,
        },
      ];
      prisma.inventoryItem.findMany.mockResolvedValue(lowStockItems);

      const result = await service.getLowStockItems();

      expect(result).toHaveLength(2);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { status: InventoryStatus.LOW_STOCK },
            { status: InventoryStatus.OUT_OF_STOCK },
          ],
        },
        orderBy: { quantity: 'asc' },
        // jest's expect.any() return type is `any` in the installed
        // @types/jest — a known, long-standing typing gap.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        include: expect.any(Object),
      });
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted item', async () => {
      const deletedItem = { ...mockInventoryItem, deletedAt: new Date() };
      prisma.inventoryItem.findUnique.mockResolvedValue(deletedItem);
      prisma.inventoryItem.update.mockResolvedValue({
        ...mockInventoryItem,
        deletedAt: null,
      });

      const result = await service.restore('item-123');

      expect(result.deletedAt).toBeNull();
    });

    it('should throw BadRequestException if item is not deleted', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(mockInventoryItem);

      await expect(service.restore('item-123')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
