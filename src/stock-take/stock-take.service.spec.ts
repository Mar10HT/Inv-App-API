import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { StockTakeService } from './stock-take.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  StockTakeStatus,
  type StockTake,
  type StockTakeItem,
  type InventoryItem,
  type Warehouse,
} from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';

describe('StockTakeService', () => {
  let service: StockTakeService;
  let prisma: DeepMockProxy<PrismaService>;
  let auditService: jest.Mocked<AuditService>;

  const mockWarehouse = {
    id: 'wh-1',
    name: 'Main Warehouse',
    isActive: true,
  } as unknown as Warehouse;

  const mockInventoryItem = {
    id: 'item-1',
    name: 'Test Item',
    quantity: 20,
    warehouseId: 'wh-1',
    deletedAt: null,
    category: 'Electronics',
  } as unknown as InventoryItem;

  const mockStockTakeItem = {
    id: 'sti-1',
    stockTakeId: 'st-1',
    itemId: 'item-1',
    expectedQty: 20,
    countedQty: null,
    variance: null,
    notes: null,
    countedAt: null,
    item: mockInventoryItem,
  } as unknown as StockTakeItem;

  const mockStockTake = {
    id: 'st-1',
    warehouseId: 'wh-1',
    startedById: 'user-1',
    completedById: null,
    status: StockTakeStatus.IN_PROGRESS,
    notes: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    warehouse: mockWarehouse,
    startedBy: { id: 'user-1', name: 'Admin', email: 'admin@test.com' },
    completedBy: null,
    items: [mockStockTakeItem],
  } as unknown as StockTake;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    prisma.inventoryItem.update.mockResolvedValue(mockInventoryItem);
    prisma.$transaction.mockImplementation(((
      cb: (tx: DeepMockProxy<PrismaService>) => unknown,
    ) => cb(prisma)) as never);

    const mockAuditService = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockTakeService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<StockTakeService>(StockTakeService);
    auditService = module.get(AuditService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const dto = { warehouseId: 'wh-1', notes: null };

    it('creates a stock take with all warehouse items', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      prisma.stockTake.findFirst.mockResolvedValue(null);
      prisma.inventoryItem.findMany.mockResolvedValue([mockInventoryItem]);
      prisma.stockTake.create.mockResolvedValue(mockStockTake);

      const result = await service.create(dto, 'user-1');

      expect(result).toEqual(mockStockTake);
      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entity: 'StockTake' }),
      );
    });

    it('throws NotFoundException when warehouse not found', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when in-progress stock take already exists', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);
      prisma.stockTake.findFirst.mockResolvedValue(mockStockTake);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('returns paginated stock takes', async () => {
      prisma.stockTake.findMany.mockResolvedValue([mockStockTake]);
      prisma.stockTake.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('filters by status when provided', async () => {
      prisma.stockTake.findMany.mockResolvedValue([mockStockTake]);
      prisma.stockTake.count.mockResolvedValue(1);

      await service.findAll({}, StockTakeStatus.IN_PROGRESS);

      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.stockTake.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: StockTakeStatus.IN_PROGRESS },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns stock take by id', async () => {
      prisma.stockTake.findUnique.mockResolvedValue(mockStockTake);

      const result = await service.findOne('st-1');

      expect(result).toEqual(mockStockTake);
    });

    it('throws NotFoundException when not found', async () => {
      prisma.stockTake.findUnique.mockResolvedValue(null);

      await expect(service.findOne('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateItem', () => {
    const dto = { itemId: 'item-1', countedQty: 18, notes: 'Recounted' };

    it('updates item count and calculates variance', async () => {
      const updatedItem = {
        ...mockStockTakeItem,
        countedQty: 18,
        variance: -2,
      };
      prisma.stockTake.findUnique.mockResolvedValue(mockStockTake);
      prisma.stockTakeItem.findFirst.mockResolvedValue(mockStockTakeItem);
      prisma.stockTakeItem.update.mockResolvedValue(updatedItem);

      const result = await service.updateItem('st-1', dto, 'user-1');

      expect(result.countedQty).toBe(18);
      expect(result.variance).toBe(-2);
    });

    it('throws BadRequestException when stock take is not IN_PROGRESS', async () => {
      const completedST = {
        ...mockStockTake,
        status: StockTakeStatus.COMPLETED,
      };
      prisma.stockTake.findUnique.mockResolvedValue(completedST);

      await expect(service.updateItem('st-1', dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when item not found in stock take', async () => {
      prisma.stockTake.findUnique.mockResolvedValue(mockStockTake);
      prisma.stockTakeItem.findFirst.mockResolvedValue(null);

      await expect(service.updateItem('st-1', dto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('complete', () => {
    const countedST = {
      ...mockStockTake,
      items: [{ ...mockStockTakeItem, countedQty: 18, variance: -2 }],
    };

    it('completes a stock take without applying changes', async () => {
      const completedST = { ...countedST, status: StockTakeStatus.COMPLETED };
      prisma.stockTake.findUnique.mockResolvedValue(countedST);
      prisma.stockTake.update.mockResolvedValue(completedST);

      const result = await service.complete('st-1', 'user-1', false);

      expect(result.status).toBe(StockTakeStatus.COMPLETED);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('applies inventory changes when applyChanges=true', async () => {
      const completedST = { ...countedST, status: StockTakeStatus.COMPLETED };
      prisma.stockTake.findUnique.mockResolvedValue(countedST);
      prisma.stockTake.update.mockResolvedValue(completedST);

      await service.complete('st-1', 'user-1', true);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('throws BadRequestException when stock take is not IN_PROGRESS', async () => {
      const completedST = {
        ...mockStockTake,
        status: StockTakeStatus.COMPLETED,
      };
      prisma.stockTake.findUnique.mockResolvedValue(completedST);

      await expect(service.complete('st-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when uncounted items remain', async () => {
      prisma.stockTake.findUnique.mockResolvedValue(mockStockTake); // countedQty = null

      await expect(service.complete('st-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancel', () => {
    it('cancels an in-progress stock take', async () => {
      const cancelledST = {
        ...mockStockTake,
        status: StockTakeStatus.CANCELLED,
      };
      prisma.stockTake.findUnique.mockResolvedValue(mockStockTake);
      prisma.stockTake.update.mockResolvedValue(cancelledST);

      const result = await service.cancel('st-1', 'user-1');

      expect(result.status).toBe(StockTakeStatus.CANCELLED);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          changes: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
    });

    it('throws BadRequestException when stock take is already COMPLETED', async () => {
      const completedST = {
        ...mockStockTake,
        status: StockTakeStatus.COMPLETED,
      };
      prisma.stockTake.findUnique.mockResolvedValue(completedST);

      await expect(service.cancel('st-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getVarianceReport', () => {
    it('returns variance summary for a completed stock take', async () => {
      const stWithVariance = {
        ...mockStockTake,
        status: StockTakeStatus.COMPLETED,
        items: [
          { ...mockStockTakeItem, countedQty: 18, variance: -2 },
          {
            ...mockStockTakeItem,
            id: 'sti-2',
            itemId: 'item-2',
            countedQty: 22,
            variance: 2,
          },
        ],
      };
      prisma.stockTake.findUnique.mockResolvedValue(stWithVariance);

      const result = await service.getVarianceReport('st-1');

      expect(result.summary.itemsWithVariance).toBe(2);
      expect(result.summary.negativeVariance).toBe(1);
      expect(result.summary.positiveVariance).toBe(1);
    });
  });

  describe('getStats', () => {
    it('returns counts by status', async () => {
      prisma.stockTake.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(2) // inProgress
        .mockResolvedValueOnce(7) // completed
        .mockResolvedValueOnce(1); // cancelled
      prisma.stockTake.findMany.mockResolvedValue([]);

      const result = await service.getStats();

      expect(result.total).toBe(10);
      expect(result.byStatus.inProgress).toBe(2);
      expect(result.byStatus.completed).toBe(7);
      expect(result.byStatus.cancelled).toBe(1);
    });
  });
});
