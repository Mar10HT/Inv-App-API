import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { StockMovementsService } from './stock-movements.service';
import { PrismaService } from '../prisma/prisma.service';

const wh = (id: string) => ({ id, name: `Bodega ${id}` });
const ana = { name: 'Ana', email: 'ana@x.com' };
const day = (d: number) => new Date(Date.UTC(2026, 9, d));
const line = (quantity: number, id = 'i1') => ({
  inventoryItemId: id,
  quantity,
  inventoryItem: { id, name: `Item ${id}`, sku: null },
});

// Covers every day() used below
const october = { from: day(1), to: day(31) };

describe('StockMovementsService', () => {
  let service: StockMovementsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    for (const model of [
      prisma.transaction,
      prisma.sale,
      prisma.purchaseInvoice,
      prisma.outflow,
      prisma.transferRequest,
      prisma.stockTake,
    ]) {
      (model.findMany as jest.Mock).mockResolvedValue([]);
    }
    const module = await Test.createTestingModule({
      providers: [
        StockMovementsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(StockMovementsService);
  });

  it('lists a sale as stock leaving its warehouse when it was confirmed, and its cancellation as stock coming back', async () => {
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 's1',
        number: 'V-0001',
        createdAt: day(1),
        confirmedAt: day(2),
        cancelledAt: day(3),
        warehouse: wh('a'),
        createdBy: ana,
        cancelledBy: ana,
        items: [line(2), line(3, 'i2')],
      },
    ] as never);

    const [cancel, sale] = await service.findAll(null, october);

    expect(sale).toEqual(
      expect.objectContaining({
        id: 'SALE:s1',
        type: 'OUT',
        date: day(2),
        reference: 'V-0001',
        sourceWarehouseId: 'a',
        sourceWarehouse: wh('a'),
        destinationWarehouse: null,
        items: [line(2), line(3, 'i2')],
        cancellation: false,
      }),
    );
    expect(cancel).toEqual(
      expect.objectContaining({
        id: 'SALE:s1:cancel',
        type: 'IN',
        date: day(3),
        destinationWarehouse: wh('a'),
        cancellation: true,
      }),
    );
  });

  it('falls back to the creation date for sales confirmed before confirmedAt existed', async () => {
    prisma.sale.findMany.mockResolvedValue([
      {
        id: 's1',
        number: 'V-0001',
        createdAt: day(1),
        confirmedAt: null,
        cancelledAt: null,
        warehouse: wh('a'),
        createdBy: ana,
        cancelledBy: null,
        items: [line(1)],
      },
    ] as never);

    const [movement] = await service.findAll(null, october);
    expect(movement.date).toEqual(day(1));
  });

  it('lists a purchase as stock coming in', async () => {
    prisma.purchaseInvoice.findMany.mockResolvedValue([
      {
        id: 'p1',
        number: 'COM-0001',
        createdAt: day(1),
        cancelledAt: null,
        warehouse: wh('a'),
        createdBy: ana,
        cancelledBy: null,
        items: [line(10)],
      },
    ] as never);

    const [movement] = await service.findAll(null, october);
    expect(movement).toEqual(
      expect.objectContaining({
        type: 'IN',
        origin: 'PURCHASE',
        destinationWarehouseId: 'a',
        items: [line(10)],
      }),
    );
  });

  it('splits a stock take into what it added and what it removed', async () => {
    prisma.stockTake.findMany.mockResolvedValue([
      {
        id: 'st1',
        completedAt: day(4),
        updatedAt: day(4),
        warehouse: wh('a'),
        completedBy: ana,
        notes: null,
        items: [
          {
            itemId: 'up',
            item: { id: 'up', name: 'Up', sku: null },
            expectedQty: 5,
            countedQty: 8,
          },
          {
            itemId: 'down',
            item: { id: 'down', name: 'Down', sku: null },
            expectedQty: 5,
            countedQty: 1,
          },
          {
            itemId: 'same',
            item: { id: 'same', name: 'Same', sku: null },
            expectedQty: 5,
            countedQty: 5,
          },
          {
            itemId: 'none',
            item: { id: 'none', name: 'None', sku: null },
            expectedQty: 5,
            countedQty: null,
          },
        ],
      },
    ] as never);

    const movements = await service.findAll(null, october);

    expect(movements).toEqual([
      expect.objectContaining({
        id: 'STOCK_TAKE:st1:in',
        type: 'IN',
        items: [
          expect.objectContaining({ inventoryItemId: 'up', quantity: 3 }),
        ],
      }),
      expect.objectContaining({
        id: 'STOCK_TAKE:st1:out',
        type: 'OUT',
        items: [
          expect.objectContaining({ inventoryItemId: 'down', quantity: 4 }),
        ],
      }),
    ]);
  });

  it('only asks for stock takes whose counts were applied, and only completed transfers', async () => {
    await service.findAll(null, october);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.stockTake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ adjustmentsApplied: true }) as unknown,
      }),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.transferRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'COMPLETED' }) as unknown,
      }),
    );
  });

  it('leaves out quotations that were cancelled before being confirmed', async () => {
    await service.findAll(null, october);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          NOT: { confirmedAt: null, quoteNumber: { not: null } },
        }) as unknown,
      }),
    );
  });

  it('merges every source newest first', async () => {
    prisma.transaction.findMany.mockResolvedValue([
      {
        id: 't1',
        type: 'IN',
        date: day(1),
        sourceWarehouseId: null,
        destinationWarehouseId: 'a',
        sourceWarehouse: null,
        destinationWarehouse: wh('a'),
        user: ana,
        items: [line(1)],
      },
    ] as never);
    prisma.transferRequest.findMany.mockResolvedValue([
      {
        id: 'tr1',
        number: 'TRA-0001',
        receivedAt: day(5),
        updatedAt: day(5),
        sourceWarehouse: wh('a'),
        destinationWarehouse: wh('b'),
        receivedBy: ana,
        requestedBy: ana,
        items: [line(2)],
      },
    ] as never);
    prisma.outflow.findMany.mockResolvedValue([
      {
        id: 'o1',
        number: 'SAL-0001',
        notes: null,
        createdAt: day(3),
        cancelledAt: null,
        warehouse: wh('a'),
        createdBy: ana,
        cancelledBy: null,
        items: [line(1)],
      },
    ] as never);

    const movements = await service.findAll(null, october);

    expect(movements.map((m) => m.id)).toEqual([
      'TRANSFER:tr1',
      'OUTFLOW:o1',
      'TRANSACTION:t1',
    ]);
  });

  it('limits every source to the warehouses the user can see', async () => {
    await service.findAll(['a'], october);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.sale.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          warehouseId: { in: ['a'] },
        }) as unknown,
      }),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { sourceWarehouseId: { in: ['a'] } },
            { destinationWarehouseId: { in: ['a'] } },
          ],
          date: { gte: october.from, lte: october.to },
        },
      }),
    );
  });

  describe('period and type', () => {
    const transaction = (id: string, date: Date, type = 'IN') => ({
      id,
      type,
      date,
      sourceWarehouseId: null,
      destinationWarehouseId: 'a',
      sourceWarehouse: null,
      destinationWarehouse: wh('a'),
      user: ana,
      notes: null,
      items: [line(1)],
    });

    it('asks every source only for the documents that moved stock in the period', async () => {
      await service.findAll(null, { from: day(5), to: day(9) });
      const inRange = { gte: day(5), lte: day(9) };

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ date: inRange }) as unknown,
        }),
      );
      // A purchase counts for when it was saved and for when it was cancelled
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.purchaseInvoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ createdAt: inRange }, { cancelledAt: inRange }],
          }) as unknown,
        }),
      );
    });

    it('lists a cancellation in the period even when the sale was saved before it', async () => {
      prisma.sale.findMany.mockResolvedValue([
        {
          id: 's1',
          number: 'V-0001',
          notes: null,
          createdAt: day(1),
          confirmedAt: day(1),
          cancelledAt: day(7),
          warehouse: wh('a'),
          createdBy: ana,
          cancelledBy: ana,
          items: [line(1)],
        },
      ] as never);

      const movements = await service.findAll(null, {
        from: day(5),
        to: day(9),
      });

      expect(movements.map((m) => m.id)).toEqual(['SALE:s1:cancel']);
    });

    it('keeps only the movements of the type asked for', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        transaction('t1', day(2), 'IN'),
        transaction('t2', day(3), 'OUT'),
      ] as never);

      const movements = await service.findAll(null, {
        ...october,
        type: 'OUT',
      });

      expect(movements.map((m) => m.id)).toEqual(['TRANSACTION:t2']);
    });

    it('returns one page and the totals of the whole period', async () => {
      prisma.transaction.findMany.mockResolvedValue([
        transaction('t1', day(1), 'IN'),
        transaction('t2', day(2), 'OUT'),
        transaction('t3', day(3), 'IN'),
      ] as never);

      const result = await service.findPage(null, october, {
        page: 2,
        limit: 2,
      });

      expect(result.data.map((m) => m.id)).toEqual(['TRANSACTION:t1']);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 3, page: 2, limit: 2, totalPages: 2 }),
      );
      expect(result.summary).toEqual({
        total: 3,
        inCount: 2,
        outCount: 1,
        transferCount: 0,
        totalItems: 3,
      });
    });
  });
});
