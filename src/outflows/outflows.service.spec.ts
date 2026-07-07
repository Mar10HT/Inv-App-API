import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { OutflowReason, OutflowStatus } from '@prisma/client';
import { OutflowsService } from './outflows.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('OutflowsService', () => {
  let service: OutflowsService;
  let prisma: any;

  const mockWarehouse = { id: 'wh-1', name: 'Main' };

  const mockItem = {
    id: 'item-1',
    name: 'Widget',
    serviceTag: null,
    warehouseId: 'wh-1',
    quantity: 10,
    price: 50,
    currency: 'USD',
  };

  const mockOutflow = {
    id: 'outflow-1',
    name: null,
    warehouseId: 'wh-1',
    reason: OutflowReason.DAMAGED,
    status: OutflowStatus.ACTIVE,
    notes: null,
    createdById: 'user-1',
    cancelledById: null,
    cancelledAt: null,
    cancellationReason: null,
    items: [
      {
        id: 'oi-1',
        inventoryItemId: 'item-1',
        quantity: 2,
        itemName: 'Widget',
        serviceTag: null,
        unitPrice: 50,
        currency: 'USD',
        notes: null,
      },
    ],
    warehouse: mockWarehouse,
  };

  beforeEach(async () => {
    prisma = {
      inventoryItem: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
      outflow: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: any) => any) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutflowsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: { log: jest.fn(), logSafe: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<OutflowsService>(OutflowsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const baseDto = () => ({
      warehouseId: 'wh-1',
      reason: OutflowReason.DAMAGED,
      items: [{ inventoryItemId: 'item-1', quantity: 2 }],
    });

    it('creates an outflow and decrements stock', async () => {
      prisma.inventoryItem.findMany
        .mockResolvedValueOnce([mockItem]) // snapshot lookup in create()
        .mockResolvedValueOnce([mockItem]); // current-quantity lookup in createInternal()
      prisma.outflow.create.mockResolvedValue(mockOutflow);

      const result = await service.create(baseDto(), 'user-1');

      expect(result).toEqual(mockOutflow);
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { quantity: { decrement: 2 } },
      });
    });

    it('throws ForbiddenException when user has no access to the warehouse', async () => {
      await expect(
        service.create(baseDto(), 'user-1', ['other-wh']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when items are empty', async () => {
      await expect(
        service.create({ ...baseDto(), items: [] }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on duplicate items in payload', async () => {
      await expect(
        service.create(
          {
            ...baseDto(),
            items: [
              { inventoryItemId: 'item-1', quantity: 1 },
              { inventoryItemId: 'item-1', quantity: 1 },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when an item does not exist', async () => {
      prisma.inventoryItem.findMany.mockResolvedValueOnce([]);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when item belongs to a different warehouse', async () => {
      prisma.inventoryItem.findMany.mockResolvedValueOnce([
        { ...mockItem, warehouseId: 'other-wh' },
      ]);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when stock is insufficient', async () => {
      prisma.inventoryItem.findMany
        .mockResolvedValueOnce([mockItem])
        .mockResolvedValueOnce([{ ...mockItem, quantity: 1 }]);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findOne', () => {
    it('returns the outflow', async () => {
      prisma.outflow.findUnique.mockResolvedValue(mockOutflow);

      const result = await service.findOne('outflow-1');

      expect(result).toEqual(mockOutflow);
    });

    it('throws NotFoundException when missing', async () => {
      prisma.outflow.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user has no access to the warehouse', async () => {
      prisma.outflow.findUnique.mockResolvedValue(mockOutflow);

      await expect(service.findOne('outflow-1', ['other-wh'])).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('cancel', () => {
    it('restores stock and marks the outflow CANCELLED', async () => {
      prisma.outflow.findUnique
        .mockResolvedValueOnce(mockOutflow) // findOne() access check
        .mockResolvedValueOnce(mockOutflow); // TOCTOU re-check inside tx
      prisma.outflow.update.mockResolvedValue({
        ...mockOutflow,
        status: OutflowStatus.CANCELLED,
      });

      const result = await service.cancel('outflow-1', 'user-2', 'Mistake');

      expect(result.status).toBe(OutflowStatus.CANCELLED);
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { quantity: { increment: 2 } },
      });
    });

    it('throws BadRequestException when outflow is already CANCELLED', async () => {
      const cancelledOutflow = {
        ...mockOutflow,
        status: OutflowStatus.CANCELLED,
      };
      prisma.outflow.findUnique
        .mockResolvedValueOnce(cancelledOutflow)
        .mockResolvedValueOnce(cancelledOutflow);

      await expect(service.cancel('outflow-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when user has no access to the warehouse', async () => {
      prisma.outflow.findUnique.mockResolvedValue(mockOutflow);

      await expect(
        service.cancel('outflow-1', 'user-2', undefined, ['other-wh']),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('getStats', () => {
    it('returns counts grouped by reason', async () => {
      prisma.outflow.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(7) // active
        .mockResolvedValueOnce(3); // cancelled
      prisma.outflow.groupBy.mockResolvedValue([
        { reason: OutflowReason.DAMAGED, _count: { _all: 4 } },
        { reason: OutflowReason.LOST, _count: { _all: 3 } },
      ]);

      const result = await service.getStats();

      expect(result.total).toBe(10);
      expect(result.active).toBe(7);
      expect(result.cancelled).toBe(3);
      expect(result.byReason).toEqual({ DAMAGED: 4, LOST: 3 });
    });
  });
});
