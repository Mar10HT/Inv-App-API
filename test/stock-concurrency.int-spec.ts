/**
 * Integration test against a real PostgreSQL database: the guarantees under
 * test (row locks, conditional UPDATEs) only exist in the database, a mocked
 * Prisma can't show them.
 *
 * Needs DATABASE_URL pointing at a disposable database with the schema
 * pushed (`prisma db push`). Run with `npm run test:integration`.
 */
import {
  CustomerType,
  ItemType,
  PrismaClient,
  SaleStatus,
} from '@prisma/client';
import { SalesService } from '../src/sales/sales.service';
import { SaleNumberingService } from '../src/sales/sale-numbering.service';
import { DocumentNumberingService } from '../src/common/numbering/document-numbering.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { AuditService } from '../src/audit/audit.service';
import type { PermissionsService } from '../src/permissions/permissions.service';
import type { StockLevelService } from '../src/alerts/stock-level.service';

const prisma = new PrismaClient();

const sales = new SalesService(
  prisma as unknown as PrismaService,
  { logSafe: () => undefined } as unknown as AuditService,
  new SaleNumberingService(),
  {
    getPermissionsForUser: () => Promise.resolve(['*']),
  } as unknown as PermissionsService,
  { scheduleRefresh: () => undefined } as unknown as StockLevelService,
  new DocumentNumberingService(),
);

const run = `int-${Date.now()}`;
let userId: string;
let warehouseId: string;

const newItem = async (quantity: number) =>
  prisma.inventoryItem.create({
    data: {
      name: `${run}-item-${Math.random()}`,
      quantity,
      category: 'Test',
      itemType: ItemType.BULK,
      warehouseId,
    },
  });

const saleOf = (
  inventoryItemId: string,
  quantity: number,
  asDraft = false,
) => ({
  warehouseId,
  customerType: CustomerType.RETAIL,
  currency: 'HNL',
  asDraft,
  items: [{ inventoryItemId, quantity, unitPrice: 10 }],
});

const stockOf = async (id: string) =>
  (await prisma.inventoryItem.findUniqueOrThrow({ where: { id } })).quantity;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: `${run}@test.local`, password: 'x', name: run },
  });
  const warehouse = await prisma.warehouse.create({
    data: { name: run, location: 'test' },
  });
  userId = user.id;
  warehouseId = warehouse.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('stock under concurrent requests', () => {
  it('never sells more than is in stock: three sales of 4 against 10 units, only two go through', async () => {
    const item = await newItem(10);

    const results = await Promise.allSettled(
      [1, 2, 3].map(() => sales.create(saleOf(item.id, 4), userId)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      reason: { response: { code: 'INSUFFICIENT_STOCK' } },
    });
    expect(await stockOf(item.id)).toBe(2);
  });

  it('confirms a quotation once, however many confirmations arrive together', async () => {
    const item = await newItem(10);
    const draft = await sales.create(saleOf(item.id, 4, true), userId);

    const results = await Promise.allSettled(
      [1, 2, 3].map(() => sales.confirm(draft.id, userId)),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stockOf(item.id)).toBe(6);
    const sale = await prisma.sale.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(sale.status).toBe(SaleStatus.ACTIVE);
    expect(sale.number).not.toBeNull();
  });

  it('restores stock once, however many cancellations arrive together', async () => {
    const item = await newItem(10);
    const sale = await sales.create(saleOf(item.id, 4), userId);
    expect(await stockOf(item.id)).toBe(6);

    const results = await Promise.allSettled(
      [1, 2, 3].map(() => sales.cancel(sale.id, userId, 'test')),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await stockOf(item.id)).toBe(10);
  });
});
