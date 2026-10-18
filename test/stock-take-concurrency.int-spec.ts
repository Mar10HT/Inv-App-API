/**
 * Integration test against a real PostgreSQL database: the row locks under
 * test only exist in the database, a mocked Prisma can't show them.
 *
 * Needs DATABASE_URL pointing at a disposable database with the schema
 * pushed (`prisma db push`). Run with `npm run test:integration`.
 */
import { ItemType, PrismaClient, StockTakeStatus } from '@prisma/client';
import { StockTakeService } from '../src/stock-take/stock-take.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { AuditService } from '../src/audit/audit.service';
import type { StockLevelService } from '../src/alerts/stock-level.service';

const prisma = new PrismaClient();

// Every audit entry the service writes, to tell how many times it applied
const audited: { entity: string; entityId: string }[] = [];
const stockTakes = new StockTakeService(
  prisma as unknown as PrismaService,
  {
    log: (entry: { entity: string; entityId: string }) => {
      audited.push(entry);
      return Promise.resolve();
    },
  } as unknown as AuditService,
  { scheduleRefresh: () => undefined } as unknown as StockLevelService,
);

const run = `int-st-${Date.now()}`;
let userId: string;

const newWarehouse = async () =>
  prisma.warehouse.create({
    data: { name: `${run}-${Math.random()}`, location: 'test' },
  });

/** A warehouse with one item of `quantity` units and a count of it started. */
const countedStockTake = async (quantity: number, counted: number) => {
  const warehouse = await newWarehouse();
  const item = await prisma.inventoryItem.create({
    data: {
      name: `${run}-item-${Math.random()}`,
      quantity,
      category: 'Test',
      itemType: ItemType.BULK,
      warehouseId: warehouse.id,
    },
  });
  const stockTake = await stockTakes.create(
    { warehouseId: warehouse.id },
    userId,
  );
  await stockTakes.updateItem(
    stockTake.id,
    { itemId: item.id, countedQty: counted },
    userId,
  );
  return { stockTake, item };
};

const stockOf = async (id: string) =>
  (await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantity;

const statusOf = async (id: string) =>
  (await prisma.stockTake.findUniqueOrThrow({ where: { id } })).status;

const codeOf = (result: PromiseSettledResult<unknown>) =>
  result.status === 'rejected'
    ? (result.reason as { response?: { code?: string } }).response?.code
    : undefined;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `${run}@test.local`, password: 'x', name: run },
  });
  userId = user.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('stock takes under concurrent requests', () => {
  it('starts only one count per warehouse when several start at once', async () => {
    for (let i = 0; i < 5; i++) {
      const warehouse = await newWarehouse();

      const results = await Promise.allSettled(
        [1, 2, 3, 4, 5].map(() =>
          stockTakes.create({ warehouseId: warehouse.id }, userId),
        ),
      );

      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        results.filter((r) => r.status === 'rejected').map(codeOf),
      ).toEqual(Array(4).fill('STOCK_TAKE_ALREADY_IN_PROGRESS'));
      expect(
        await prisma.stockTake.count({
          where: {
            warehouseId: warehouse.id,
            status: StockTakeStatus.IN_PROGRESS,
          },
        }),
      ).toBe(1);
    }
  });

  it('applies the adjustments once when the same count is completed three times at once', async () => {
    const { stockTake, item } = await countedStockTake(10, 7);

    const results = await Promise.allSettled(
      [1, 2, 3].map(() => stockTakes.complete(stockTake.id, userId, true)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').map(codeOf)).toEqual([
      'STOCK_TAKE_NOT_IN_PROGRESS',
      'STOCK_TAKE_NOT_IN_PROGRESS',
    ]);
    expect(await stockOf(item.id)).toBe(7);
    expect(
      audited.filter(
        (e) => e.entity === 'InventoryItem' && e.entityId === item.id,
      ),
    ).toHaveLength(1);
  });

  it('never leaves a cancelled count with its adjustments applied when complete and cancel race', async () => {
    for (let i = 0; i < 5; i++) {
      const { stockTake, item } = await countedStockTake(10, 7);

      const [completed, cancelled] = await Promise.allSettled([
        stockTakes.complete(stockTake.id, userId, true),
        stockTakes.cancel(stockTake.id, userId),
      ]);

      const status = await statusOf(stockTake.id);
      if (status === StockTakeStatus.CANCELLED) {
        // Cancel won: the complete waited, then found it no longer in progress
        expect(codeOf(completed)).toBe('STOCK_TAKE_NOT_IN_PROGRESS');
        expect(await stockOf(item.id)).toBe(10);
      } else {
        // Complete won: the cancel waited, then found it completed
        expect(status).toBe(StockTakeStatus.COMPLETED);
        expect(codeOf(cancelled)).toBe('STOCK_TAKE_ALREADY_COMPLETED');
        expect(await stockOf(item.id)).toBe(7);
      }
    }
  });

  it('never saves a count after the stock take was completed with what it had', async () => {
    for (let i = 0; i < 5; i++) {
      const { stockTake, item } = await countedStockTake(10, 7);

      const [, recount] = await Promise.allSettled([
        stockTakes.complete(stockTake.id, userId, true),
        stockTakes.updateItem(
          stockTake.id,
          { itemId: item.id, countedQty: 4 },
          userId,
        ),
      ]);

      // Either the recount got in first and the completion applied it, or it
      // came second and was refused: the stock always matches the saved count
      const line = await prisma.stockTakeItem.findFirstOrThrow({
        where: { stockTakeId: stockTake.id, itemId: item.id },
      });
      expect(await stockOf(item.id)).toBe(line.countedQty);
      if (recount.status === 'rejected') {
        expect(codeOf(recount)).toBe('STOCK_TAKE_NOT_EDITABLE');
      }
    }
  });
});
