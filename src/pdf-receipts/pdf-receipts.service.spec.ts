import { Test, TestingModule } from '@nestjs/testing';
import {
  SaleStatus,
  CustomerType,
  PurchaseInvoiceStatus,
  type Sale,
  type PurchaseInvoice,
} from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { PdfReceiptsService } from './pdf-receipts.service';
import { PrismaService } from '../prisma/prisma.service';

// Minimal chainable mock of PDFKit's PDFDocument: every drawing method just
// returns `doc` (mirroring the real API's fluent chaining), `text()` records
// its first argument so tests can assert on what was rendered, and `end()`
// synchronously fires the 'end' handler so render()'s wrapping Promise
// resolves without a real PDF stream.
function createMockDoc() {
  const textCalls: unknown[] = [];
  let endHandler: (() => void) | undefined;
  const doc: Record<string, unknown> = {
    page: { width: 612, height: 792 },
    x: 0,
    y: 0,
    textCalls,
    text: jest.fn((value: unknown) => {
      textCalls.push(value);
      return doc;
    }),
    on: jest.fn((event: string, cb: () => void) => {
      if (event === 'end') endHandler = cb;
      return doc;
    }),
    end: jest.fn(() => endHandler?.()),
    bufferedPageRange: jest.fn(() => ({ start: 0, count: 1 })),
  };
  for (const method of [
    'fontSize',
    'font',
    'fillColor',
    'strokeColor',
    'moveDown',
    'moveTo',
    'lineTo',
    'stroke',
    'addPage',
    'opacity',
    'rotate',
    'save',
    'restore',
    'switchToPage',
  ]) {
    doc[method] = jest.fn(() => doc);
  }
  return doc;
}

jest.mock('pdfkit', () => jest.fn().mockImplementation(() => createMockDoc()));

import PDFDocument from 'pdfkit';

describe('PdfReceiptsService', () => {
  let service: PdfReceiptsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfReceiptsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PdfReceiptsService>(PdfReceiptsService);
  });

  afterEach(() => jest.clearAllMocks());

  // Helper to read back everything rendered via doc.text(...) for the single
  // PDFDocument instance created by the render() call under test.
  const renderedStrings = (): unknown[] =>
    (
      (PDFDocument as unknown as jest.Mock).mock.results[0].value as ReturnType<
        typeof createMockDoc
      >
    ).textCalls as unknown[];

  describe('generateSaleReceipt', () => {
    // quantity * unitPrice would be 30.00 here — lineTotal is deliberately
    // set to a different value (28.50) so the test can tell whether the PDF
    // reads the persisted line subtotal or recomputes it. A genuine
    // floating-point mismatch between unit*qty and a stored lineTotal
    // rounds away after .toFixed(2) for realistic money magnitudes (no
    // divergence found scanning unit prices up to $10,000 across 2-50
    // quantities), so an organic repro isn't realistic here; this fixture
    // makes the "reads lineTotal, not unit*qty" behavior directly observable.
    const mockSale = {
      id: 'sale-1',
      quoteNumber: null,
      status: SaleStatus.ACTIVE,
      customerName: 'Acme',
      customerType: CustomerType.RETAIL,
      createdAt: new Date('2026-01-01'),
      number: 'V-0001',
      taxPercent: 15,
      totalAmount: 100,
      taxAmount: 15,
      notes: null,
      createdBy: { name: 'Jane', email: 'jane@test.com' },
      warehouse: { name: 'Main' },
      client: null,
      items: [
        {
          itemName: 'Widget',
          serviceTag: null,
          quantity: 3,
          unitPrice: 10,
          lineTotal: 28.5,
          currency: 'USD',
          taxPercent: null,
          taxAmount: 4.28,
          inventoryItem: null,
        },
      ],
    } as unknown as Sale;

    it('renders the persisted lineTotal instead of recomputing unitPrice * quantity', async () => {
      prisma.sale.findUnique.mockResolvedValue(mockSale);

      await service.generateSaleReceipt('sale-1');

      const rendered = renderedStrings();
      expect(rendered).toContain('USD 28.50');
      expect(rendered).not.toContain('USD 30.00');
    });

    it('renders the sale totalAmount/taxAmount instead of re-summing the lines', async () => {
      prisma.sale.findUnique.mockResolvedValue(mockSale);

      await service.generateSaleReceipt('sale-1');

      const rendered = renderedStrings();
      // ctx.totalAmount/taxAmount (100/15) rather than the single line's
      // lineTotal/taxAmount (28.50/4.28).
      expect(rendered).toContain('USD 100.00');
      expect(rendered).toContain('USD 15.00');
      expect(rendered).toContain('USD 115.00');
    });
  });

  describe('generatePurchaseReceipt', () => {
    // Same rationale as the sale fixture above: lineTotal (23.00) deliberately
    // differs from quantity * unitPrice (25.00).
    const mockInvoice = {
      id: 'inv-1',
      status: PurchaseInvoiceStatus.ACTIVE,
      supplier: { name: 'Acme Supplies' },
      invoiceNumber: 'FAC-001',
      createdAt: new Date('2026-01-01'),
      number: 'COM-0001',
      taxPercent: 15,
      totalAmount: 50,
      taxAmount: 7.5,
      notes: null,
      createdBy: { name: 'Jane', email: 'jane@test.com' },
      warehouse: { name: 'Main' },
      items: [
        {
          itemName: 'Gadget',
          serviceTag: null,
          quantity: 5,
          unitPrice: 5,
          lineTotal: 23,
          currency: 'USD',
          taxPercent: null,
          taxAmount: 3.45,
          inventoryItem: null,
        },
      ],
    } as unknown as PurchaseInvoice;

    it('renders the persisted lineTotal instead of recomputing unitPrice * quantity', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(mockInvoice);

      await service.generatePurchaseReceipt('inv-1');

      const rendered = renderedStrings();
      expect(rendered).toContain('USD 23.00');
      expect(rendered).not.toContain('USD 25.00');
    });
  });
});
