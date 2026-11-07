/**
 * Integration test against a real PostgreSQL database for the catalog of
 * services: the protection of a service a sale uses is the foreign key's
 * onDelete: Restrict, which only exists in the database.
 *
 * Needs DATABASE_URL pointing at a disposable database with the schema
 * pushed (`prisma db push`). Run with `npm run test:integration`.
 */
import { CustomerType, ItemType, PrismaClient } from '@prisma/client';
import { SalesService } from '../src/sales/sales.service';
import { SaleNumberingService } from '../src/sales/sale-numbering.service';
import { ServicesService } from '../src/services/services.service';
import { DocumentNumberingService } from '../src/common/numbering/document-numbering.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { AuditService } from '../src/audit/audit.service';
import type { PermissionsService } from '../src/permissions/permissions.service';
import type { StockLevelService } from '../src/alerts/stock-level.service';

const prisma = new PrismaClient();
const audit = {
  log: () => Promise.resolve(),
  logSafe: () => undefined,
} as unknown as AuditService;

const sales = new SalesService(
  prisma as unknown as PrismaService,
  audit,
  new SaleNumberingService(),
  {
    getPermissionsForUser: () => Promise.resolve(['*']),
  } as unknown as PermissionsService,
  { scheduleRefresh: () => undefined } as unknown as StockLevelService,
  new DocumentNumberingService(),
);
const services = new ServicesService(prisma as unknown as PrismaService, audit);

const run = `int-svc-${Date.now()}`;
let userId: string;
let warehouseId: string;

const newService = (suffix: string) =>
  prisma.service.create({
    data: { name: `${run}-${suffix}`, currency: 'HNL' },
  });

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

describe('services in sales', () => {
  it('sells products, services and one-off lines together; only the product takes stock, and cancelling gives it back', async () => {
    const item = await prisma.inventoryItem.create({
      data: {
        name: `${run}-item`,
        quantity: 10,
        category: 'Test',
        itemType: ItemType.BULK,
        warehouseId,
      },
    });
    const install = await newService('install');

    const sale = await sales.create(
      {
        warehouseId,
        customerType: CustomerType.RETAIL,
        currency: 'HNL',
        items: [
          { inventoryItemId: item.id, quantity: 3, unitPrice: 100 },
          { serviceId: install.id, quantity: 1, unitPrice: 850 },
          { itemName: 'Viáticos', quantity: 1, unitPrice: 50 },
        ],
      },
      userId,
    );

    const lines = await prisma.saleItem.findMany({
      where: { saleId: sale.id },
      orderBy: { lineTotal: 'asc' },
    });
    expect(
      lines.map((l) => [l.itemName, l.inventoryItemId, l.serviceId]),
    ).toEqual([
      ['Viáticos', null, null],
      [item.name, item.id, null],
      [install.name, null, install.id],
    ]);
    expect(Number(sale.totalAmount)).toBe(1200);
    const stock = async () =>
      (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: item.id } }))
        .quantity;
    expect(await stock()).toBe(7);

    await sales.cancel(sale.id, userId, 'test');
    expect(await stock()).toBe(10);
  });

  it('confirms a quotation of only services', async () => {
    const support = await newService('support');
    const draft = await sales.create(
      {
        warehouseId,
        customerType: CustomerType.RETAIL,
        currency: 'HNL',
        asDraft: true,
        items: [{ serviceId: support.id, quantity: 2, unitPrice: 300 }],
      },
      userId,
    );

    const confirmed = await sales.confirm(draft.id, userId);

    expect(confirmed.status).toBe('ACTIVE');
    expect(Number(confirmed.totalAmount)).toBe(600);
  });

  it('refuses to delete a service a sale uses, and deletes one nobody uses', async () => {
    const used = await newService('used');
    await sales.create(
      {
        warehouseId,
        customerType: CustomerType.RETAIL,
        currency: 'HNL',
        items: [{ serviceId: used.id, quantity: 1, unitPrice: 10 }],
      },
      userId,
    );
    const unused = await newService('unused');

    await expect(services.remove(used.id, userId)).rejects.toMatchObject({
      response: { code: 'SERVICE_IN_USE', params: { name: used.name } },
    });
    await services.remove(unused.id, userId);

    expect(
      await prisma.service.findUnique({ where: { id: used.id } }),
    ).not.toBeNull();
    expect(
      await prisma.service.findUnique({ where: { id: unused.id } }),
    ).toBeNull();
  });
});
