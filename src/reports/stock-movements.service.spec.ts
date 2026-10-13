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
      prisma.dischargeRequest,
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

    const [cancel, sale] = await service.findAll(null);

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

    const [movement] = await service.findAll(null);
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

    const [movement] = await service.findAll(null);
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

    const movements = await service.findAll(null);

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

  it('only asks for stock takes whose counts were applied, and only completed transfers and discharges', async () => {
    await service.findAll(null);

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
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.dischargeRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'COMPLETED' }) as unknown,
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
    prisma.dischargeRequest.findMany.mockResolvedValue([
      {
        id: 'd1',
        resolvedAt: day(3),
        updatedAt: day(3),
        warehouse: wh('a'),
        resolvedBy: ana,
        items: [line(1)],
      },
    ] as never);

    const movements = await service.findAll(null);

    expect(movements.map((m) => m.id)).toEqual([
      'TRANSFER:tr1',
      'DISCHARGE:d1',
      'TRANSACTION:t1',
    ]);
  });

  it('limits every source to the warehouses the user can see', async () => {
    await service.findAll(['a']);

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
        },
      }),
    );
  });
});
