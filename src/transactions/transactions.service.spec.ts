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
import { StockLevelService } from '../alerts/stock-level.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('test error', {
    code,
    clientVersion: '6.x',
  });

describe('TransactionsService', () => {
  let service: TransactionsService;
  let prisma: DeepMockProxy<PrismaService>;
  let stockLevel: { scheduleRefresh: jest.Mock };

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
    // takeStock: the conditional decrement finds the units by default
    prisma.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    // No payments on the document unless a test says otherwise
    prisma.payment.aggregate.mockResolvedValue({
      _sum: { amount: null },
    } as never);
    stockLevel = { scheduleRefresh: jest.fn() };
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
        { provide: StockLevelService, useValue: stockLevel },
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

    it('rejects an exit (OUT) larger than the available stock instead of clamping it to zero', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([
        { ...mockInventoryItem, quantity: 5 },
      ]);
      // The conditional decrement finds fewer units than asked for
      prisma.inventoryItem.updateMany.mockResolvedValue({ count: 0 });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-123',
        name: 'Test Item',
        quantity: 5,
      } as never);
      prisma.transaction.create.mockResolvedValue(mockTransaction);

      const result = service.create({
        type: 'OUT',
        sourceWarehouseId: 'warehouse-123',
        userId: 'user-123',
        items: [{ inventoryItemId: 'item-123', quantity: 10 }],
      });
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toMatchObject({
        response: {
          code: 'INSUFFICIENT_STOCK',
          params: { available: 5, requested: 10 },
        },
      });
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
    const withLine = (type: string, stock: number, lineQty = 10): Transaction =>
      ({
        ...mockTransaction,
        type,
        items: [
          {
            id: 'item-tx-123',
            inventoryItemId: 'item-123',
            quantity: lineQty,
            notes: null,
            inventoryItem: { ...mockInventoryItem, quantity: stock },
          },
        ],
      }) as unknown as Transaction;

    it('refuses to undo a transaction from a warehouse the user cannot see', async () => {
      prisma.transaction.findUnique.mockResolvedValue(withLine('IN', 100));

      await expect(
        service.remove('transaction-123', ['other-warehouse']),
      ).rejects.toThrow(NotFoundException);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.transaction.delete).not.toHaveBeenCalled();
    });

    it('lets a user undo a transaction into one of their warehouses', async () => {
      prisma.transaction.findUnique.mockResolvedValue(withLine('IN', 100));

      await service.remove('transaction-123', ['warehouse-123']);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.transaction.delete).toHaveBeenCalled();
    });

    it('takes an entry (IN) back out of stock before deleting it', async () => {
      prisma.transaction.findUnique.mockResolvedValue(withLine('IN', 100));

      await service.remove('transaction-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'item-123', deletedAt: null, quantity: { gte: 10 } },
        data: { quantity: { decrement: 10 } },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.transaction.delete).toHaveBeenCalledWith({
        where: { id: 'transaction-123' },
      });
    });

    it('puts an exit (OUT) back into stock before deleting it', async () => {
      prisma.transaction.findUnique.mockResolvedValue(withLine('OUT', 5));

      await service.remove('transaction-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-123' },
        data: { quantity: { increment: 10 } },
      });
    });

    it('leaves stock alone for a TRANSFER, which never changed quantities', async () => {
      prisma.transaction.findUnique.mockResolvedValue(withLine('TRANSFER', 50));

      await service.remove('transaction-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.transaction.delete).toHaveBeenCalled();
    });

    it('refuses to delete an entry whose stock was already used, instead of going negative', async () => {
      prisma.transaction.findUnique.mockResolvedValue(withLine('IN', 4));
      // The conditional decrement finds fewer units than asked for
      prisma.inventoryItem.updateMany.mockResolvedValue({ count: 0 });
      prisma.inventoryItem.findFirst.mockResolvedValue({
        id: 'item-123',
        name: 'Test Item',
        quantity: 4,
      } as never);

      const result = service.remove('transaction-123');
      await expect(result).rejects.toThrow(BadRequestException);
      await expect(result).rejects.toMatchObject({
        response: { code: 'TRANSACTION_UNDO_BELOW_ZERO' },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.transaction.delete).not.toHaveBeenCalled();
    });

    it('re-evaluates stock levels after deleting', async () => {
      prisma.transaction.findUnique.mockResolvedValue(withLine('IN', 100));

      await service.remove('transaction-123');

      expect(stockLevel.scheduleRefresh).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if transaction does not exist', async () => {
      prisma.transaction.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
