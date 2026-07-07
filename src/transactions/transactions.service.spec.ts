import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TransactionsService } from './transactions.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('test error', {
    code,
    clientVersion: '6.x',
  });

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: jest.Mocked<PrismaService>;

  const mockWarehouse = {
    id: 'warehouse-123',
    name: 'Main Warehouse',
    location: 'Building A',
  };

  const mockInventoryItem = {
    id: 'item-123',
    name: 'Test Item',
    quantity: 100,
    minQuantity: 10,
    status: 'IN_STOCK',
  };

  const mockTransaction = {
    id: 'transaction-123',
    type: 'IN',
    date: new Date(),
    sourceWarehouseId: null,
    destinationWarehouseId: 'warehouse-123',
    userId: 'user-123',
    notes: 'Test transaction',
    items: [
      {
        id: 'item-tx-123',
        inventoryItemId: 'item-123',
        quantity: 10,
        notes: null,
        inventoryItem: mockInventoryItem,
      },
    ],
    sourceWarehouse: null,
    destinationWarehouse: mockWarehouse,
    user: { id: 'user-123', email: 'user@test.com', name: 'Test User' },
  };

  const mockTx = {
    transaction: {
      create: jest.fn(),
    },
    inventoryItem: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([mockInventoryItem]),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const mockPrismaService = {
      transaction: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      inventoryItem: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn((callback) => callback(mockTx)),
    };

    const mockEventsService = {
      emitTransactionChange: jest.fn(),
      emitInventoryChange: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createTransactionDto = {
      type: 'IN' as const,
      destinationWarehouseId: 'warehouse-123',
      userId: 'user-123',
      items: [{ inventoryItemId: 'item-123', quantity: 10 }],
    };

    it('should create an IN transaction successfully', async () => {
      (prisma.inventoryItem.findMany as jest.Mock).mockResolvedValue([
        { id: 'item-123' },
      ]);
      mockTx.transaction.create.mockResolvedValue(mockTransaction);
      mockTx.inventoryItem.findMany.mockResolvedValue([mockInventoryItem]);
      mockTx.inventoryItem.update.mockResolvedValue({
        ...mockInventoryItem,
        quantity: 110,
      });

      const result = await service.create(createTransactionDto);

      expect(result).toEqual(mockTransaction);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should throw BadRequestException for IN transaction without destinationWarehouseId', async () => {
      await expect(
        service.create({
          type: 'IN',
          userId: 'user-123',
          items: [{ inventoryItemId: 'item-123', quantity: 10 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for OUT transaction without sourceWarehouseId', async () => {
      await expect(
        service.create({
          type: 'OUT',
          userId: 'user-123',
          items: [{ inventoryItemId: 'item-123', quantity: 10 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for TRANSFER without both warehouses', async () => {
      await expect(
        service.create({
          type: 'TRANSFER',
          sourceWarehouseId: 'warehouse-123',
          userId: 'user-123',
          items: [{ inventoryItemId: 'item-123', quantity: 10 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if inventory item does not exist', async () => {
      (prisma.inventoryItem.findMany as jest.Mock).mockResolvedValue([]);

      await expect(service.create(createTransactionDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated transactions', async () => {
      const transactions = [mockTransaction];
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue(
        transactions,
      );
      (prisma.transaction.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(transactions);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should use default pagination when not provided', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.transaction.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAll();

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('findRecent', () => {
    it('should return recent transactions with default limit', async () => {
      const transactions = [mockTransaction];
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue(
        transactions,
      );

      const result = await service.findRecent();

      expect(result).toEqual(transactions);
      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        take: 10,
        orderBy: { date: 'desc' },
        include: expect.any(Object),
      });
    });

    it('should return recent transactions with custom limit', async () => {
      (prisma.transaction.findMany as jest.Mock).mockResolvedValue([]);

      await service.findRecent(5);

      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        take: 5,
        orderBy: { date: 'desc' },
        include: expect.any(Object),
      });
    });
  });

  describe('findOne', () => {
    it('should return a transaction by ID', async () => {
      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(
        mockTransaction,
      );

      const result = await service.findOne('transaction-123');

      expect(result).toEqual(mockTransaction);
    });

    it('should throw NotFoundException if transaction does not exist', async () => {
      (prisma.transaction.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a transaction', async () => {
      const updatedTransaction = { ...mockTransaction, notes: 'Updated notes' };
      (prisma.transaction.update as jest.Mock).mockResolvedValue(
        updatedTransaction,
      );

      const result = await service.update('transaction-123', {
        notes: 'Updated notes',
      });

      expect(result.notes).toBe('Updated notes');
    });

    it('should throw NotFoundException if transaction does not exist', async () => {
      (prisma.transaction.update as jest.Mock).mockRejectedValue(
        prismaError('P2025'),
      );

      await expect(
        service.update('nonexistent', { notes: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a transaction', async () => {
      (prisma.transaction.delete as jest.Mock).mockResolvedValue(
        mockTransaction,
      );

      await service.remove('transaction-123');

      expect(prisma.transaction.delete).toHaveBeenCalledWith({
        where: { id: 'transaction-123' },
      });
    });

    it('should throw NotFoundException if transaction does not exist', async () => {
      (prisma.transaction.delete as jest.Mock).mockRejectedValue(
        prismaError('P2025'),
      );

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
