import { Test } from '@nestjs/testing';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import ExcelJS from 'exceljs';
import { ReportsService } from './reports.service';
import {
  StockMovementsService,
  type StockMovement,
} from './stock-movements.service';
import { PrismaService } from '../prisma/prisma.service';

const wh = (id: string) => ({ id, name: `Bodega ${id}` });
const ana = { name: 'Ana', email: 'ana@x.com' };

// Builds a StockMovement fixture with sane defaults, override only what a
// given test cares about.
const movement = (overrides: Partial<StockMovement>): StockMovement => ({
  id: 'M:1',
  date: new Date('2026-10-05T12:00:00Z'),
  type: 'IN',
  origin: 'TRANSACTION',
  cancellation: false,
  reference: null,
  notes: null,
  sourceWarehouseId: null,
  destinationWarehouseId: 'a',
  sourceWarehouse: null,
  destinationWarehouse: wh('a'),
  user: ana,
  items: [{ inventoryItemId: 'i1', quantity: 2, inventoryItem: null }],
  ...overrides,
});

// Reads back the "Transactions" worksheet of a generated buffer so tests
// assert against the real xlsx output, not an internal data structure.
async function readSheet(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  const headers = (worksheet.getRow(1).values as unknown[]).slice(
    1,
  ) as string[];
  const rows: Record<string, unknown>[] = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = (row.values as unknown[]).slice(1);
    const entry: Record<string, unknown> = {};
    headers.forEach((header, idx) => (entry[header] = values[idx]));
    rows.push(entry);
  });
  return { headers, rows };
}

describe('ReportsService.generateTransactionsReport', () => {
  let service: ReportsService;
  let prisma: DeepMockProxy<PrismaService>;
  let stockMovements: jest.Mocked<StockMovementsService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    stockMovements = {
      findAll: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<StockMovementsService>;

    const module = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: PrismaService, useValue: prisma },
        { provide: StockMovementsService, useValue: stockMovements },
      ],
    }).compile();
    service = module.get(ReportsService);
  });

  it('reads its rows from StockMovementsService.findAll instead of the transactions table directly', async () => {
    const from = new Date('2026-10-01T00:00:00Z');
    const to = new Date('2026-10-31T23:59:59Z');

    await service.generateTransactionsReport(from, to, ['wh-1'], 'es');

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(stockMovements.findAll).toHaveBeenCalledWith(['wh-1'], { from, to });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
  });

  it('defaults to a wide period when no dates are given, so the export keeps its previous "whole history" behaviour', async () => {
    await service.generateTransactionsReport(undefined, undefined, null, 'es');

    const call = stockMovements.findAll.mock.calls[0];
    const query = call[1];
    expect(query.from.getFullYear()).toBeLessThan(1980);
    expect(Date.now() - query.to.getTime()).toBeLessThan(5000);
  });

  it('lists a sale, a purchase, a cancellation, a transfer and an applied stock take as rows', async () => {
    stockMovements.findAll.mockResolvedValue([
      movement({
        id: 'SALE:s1',
        origin: 'SALE',
        type: 'OUT',
        reference: 'V-0001',
        sourceWarehouse: wh('a'),
        destinationWarehouse: null,
      }),
      movement({
        id: 'PURCHASE:p1',
        origin: 'PURCHASE',
        type: 'IN',
        reference: 'COM-0001',
      }),
      movement({
        id: 'OUTFLOW:o1:cancel',
        origin: 'OUTFLOW',
        type: 'IN',
        reference: 'SAL-0001',
        cancellation: true,
      }),
      movement({
        id: 'TRANSFER:tr1',
        origin: 'TRANSFER',
        type: 'TRANSFER',
        reference: 'TRA-0001',
        sourceWarehouse: wh('a'),
        destinationWarehouse: wh('b'),
      }),
      movement({
        id: 'STOCK_TAKE:st1:in',
        origin: 'STOCK_TAKE',
        type: 'IN',
        reference: null,
      }),
    ]);

    const buffer = await service.generateTransactionsReport(
      undefined,
      undefined,
      null,
      'es',
    );
    const { rows } = await readSheet(buffer);

    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.ID)).toEqual([
      'SALE:s1',
      'PURCHASE:p1',
      'OUTFLOW:o1:cancel',
      'TRANSFER:tr1',
      'STOCK_TAKE:st1:in',
    ]);
  });

  it('includes the Documento and Origen columns, with the document number and translated movement origin per row', async () => {
    stockMovements.findAll.mockResolvedValue([
      movement({ id: 'SALE:s1', origin: 'SALE', reference: 'V-0001' }),
      movement({
        id: 'TRANSACTION:t1',
        origin: 'TRANSACTION',
        reference: null,
      }),
    ]);

    const buffer = await service.generateTransactionsReport(
      undefined,
      undefined,
      null,
      'es',
    );
    const { headers, rows } = await readSheet(buffer);

    expect(headers).toContain('Documento');
    expect(headers).toContain('Origen');
    expect(rows[0].Documento).toBe('V-0001');
    expect(rows[0].Origen).toBe('Venta');
    expect(rows[1].Documento).toBe('-');
    expect(rows[1].Origen).toBe('Transacción manual');
  });

  it('translates Document/Origin headers and values to English when locale is "en"', async () => {
    stockMovements.findAll.mockResolvedValue([
      movement({
        id: 'PURCHASE:p1',
        origin: 'PURCHASE',
        reference: 'COM-0001',
      }),
    ]);

    const buffer = await service.generateTransactionsReport(
      undefined,
      undefined,
      null,
      'en',
    );
    const { headers, rows } = await readSheet(buffer);

    expect(headers).toContain('Document');
    expect(headers).toContain('Origin');
    expect(rows[0].Document).toBe('COM-0001');
    expect(rows[0].Origin).toBe('Purchase');
  });
});
