import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import {
  Prisma,
  type Transaction,
  type InventoryItem,
  type Warehouse,
} from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
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
  let prisma: DeepMockProxy<PrismaService>;

  const mockWarehouse = {
    id: 'warehouse-123',
    name: 'Main Warehouse',
    location: 'Building A',
  } as unknown as Warehouse;

  const mockInventoryItem = {
    id: 'item-123',
    name: 'Test Item',
    quantity: 100,
    minQuantity: 10,
    status: 'IN_STOCK',
  } as unknown as InventoryItem;

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
  } as unknown as Transaction;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    prisma.inventoryItem.findMany.mockResolvedValue([mockInventoryItem]);
    prisma.$transaction.mockImplementation(((
      cb: (tx: DeepMockProxy<PrismaService>) => unknown,
    ) => cb(prisma)) as never);

    const mockEventsService = {
      emitTransactionChange: jest.fn(),
      emitInventoryChange: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsService, useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<TransactionsService>(TransactionsService);
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
      prisma.inventoryItem.findMany.mockResolvedValue([mockInventoryItem]);
      prisma.transaction.create.mockResolvedValue(mockTransaction);
      prisma.inventoryItem.update.mockResolvedValue({
        ...mockInventoryItem,
        quantity: 110,
      });

      const result = await service.create(createTransactionDto);

      expect(result).toEqual(mockTransaction);
      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
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
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      await expect(service.create(createTransactionDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated transactions', async () => {
      const transactions = [mockTransaction];
      prisma.transaction.findMany.mockResolvedValue(transactions);
      prisma.transaction.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(transactions);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should use default pagination when not provided', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);
      prisma.transaction.count.mockResolvedValue(0);

      const result = await service.findAll();

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('findRecent', () => {
    it('should return recent transactions with default limit', async () => {
      const transactions = [mockTransaction];
      prisma.transaction.findMany.mockResolvedValue(transactions);

      const result = await service.findRecent();

      expect(result).toEqual(transactions);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        // jest's expect.any() return type is `any` in the installed
        // @types/jest — a known, long-standing typing gap.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.any(Object),
        take: 10,
        orderBy: { date: 'desc' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        include: expect.any(Object),
      });
    });

    it('should return recent transactions with custom limit', async () => {
      prisma.transaction.findMany.mockResolvedValue([]);

      await service.findRecent(5);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.transaction.findMany).toHaveBeenCalledWith({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        where: expect.any(Object),
        take: 5,
        orderBy: { date: 'desc' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        include: expect.any(Object),
      });
    });
  });

  describe('findOne', () => {
    it('should return a transaction by ID', async () => {
      prisma.transaction.findUnique.mockResolvedValue(mockTransaction);

      const result = await service.findOne('transaction-123');

      expect(result).toEqual(mockTransaction);
    });

    it('should throw NotFoundException if transaction does not exist', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a transaction', async () => {
      const updatedTransaction = { ...mockTransaction, notes: 'Updated notes' };
      prisma.transaction.update.mockResolvedValue(updatedTransaction);

      const result = await service.update('transaction-123', {
        notes: 'Updated notes',
      });

      expect(result.notes).toBe('Updated notes');
    });

    it('should throw NotFoundException if transaction does not exist', async () => {
      prisma.transaction.update.mockRejectedValue(prismaError('P2025'));

      await expect(
        service.update('nonexistent', { notes: 'test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a transaction', async () => {
      prisma.transaction.delete.mockResolvedValue(mockTransaction);

      await service.remove('transaction-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.transaction.delete).toHaveBeenCalledWith({
        where: { id: 'transaction-123' },
      });
    });

    it('should throw NotFoundException if transaction does not exist', async () => {
      prisma.transaction.delete.mockRejectedValue(prismaError('P2025'));

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
