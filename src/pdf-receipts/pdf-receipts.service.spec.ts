import { Test, TestingModule } from '@nestjs/testing';
import {
  Prisma,
  SaleStatus,
  CustomerType,
  PurchaseInvoiceStatus,
  LoanStatus,
  OutflowStatus,
  RequestStatus,
  type Sale,
  type PurchaseInvoice,
  type Loan,
  type Outflow,
  type TransferRequest,
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
    widthOfString: jest.fn(() => 40),
    // Single-line height for these fixtures' short strings — real wrapping
    // behavior is covered directly in receipt-components.spec.ts.
    heightOfString: jest.fn(() => 12),
  };
  for (const method of [
    'fontSize',
    'font',
    'fillColor',
    'strokeColor',
    'lineWidth',
    'moveDown',
    'moveTo',
    'lineTo',
    'stroke',
    'rect',
    'fillAndStroke',
    'image',
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
      taxPercent: new Prisma.Decimal(15),
      totalAmount: new Prisma.Decimal(100),
      taxAmount: new Prisma.Decimal(15),
      notes: null,
      createdBy: { name: 'Jane', email: 'jane@test.com' },
      warehouse: { name: 'Main' },
      client: null,
      items: [
        {
          itemName: 'Widget',
          serviceTag: null,
          quantity: 3,
          unitPrice: new Prisma.Decimal(10),
          lineTotal: new Prisma.Decimal('28.50'),
          currency: 'USD',
          taxPercent: null,
          taxAmount: new Prisma.Decimal('4.28'),
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
      taxPercent: new Prisma.Decimal(15),
      totalAmount: new Prisma.Decimal(50),
      taxAmount: new Prisma.Decimal('7.50'),
      notes: null,
      createdBy: { name: 'Jane', email: 'jane@test.com' },
      warehouse: { name: 'Main' },
      items: [
        {
          itemName: 'Gadget',
          serviceTag: null,
          quantity: 5,
          unitPrice: new Prisma.Decimal(5),
          lineTotal: new Prisma.Decimal(23),
          currency: 'USD',
          taxPercent: null,
          taxAmount: new Prisma.Decimal('3.45'),
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

  // A scope pair is uniquely rendered by drawScope as "Label: " (first pair)
  // or "    Label: " (subsequent pairs) via two separate .text() calls — no
  // other kit function emits a trailing ": ". Counting/detecting that
  // pattern lets these tests assert on structure (scope drawn or not, how
  // many pairs) without depending on which exact labels render.
  const SCOPE_PAIR_PATTERN = /:\s*$/;
  const isScopePair = (v: unknown): boolean =>
    typeof v === 'string' && SCOPE_PAIR_PATTERN.test(v);

  describe('generateOutflowReceipt', () => {
    const baseOutflow = {
      id: 'out-1',
      number: 'S-0001',
      status: OutflowStatus.ACTIVE,
      reason: 'DAMAGED',
      createdAt: new Date('2026-01-01'),
      notes: null,
      createdBy: { name: 'Jane', email: 'jane@test.com' },
      warehouse: { name: 'Bodega Central' },
    };

    it('draws keyValues (not scope, not a table) for a single item', async () => {
      prisma.outflow.findUnique.mockResolvedValue({
        ...baseOutflow,
        items: [
          {
            itemName: 'Router',
            serviceTag: null,
            quantity: 2,
            unitPrice: null,
            currency: null,
            inventoryItem: null,
          },
        ],
      } as unknown as Outflow);

      await service.generateOutflowReceipt('out-1');

      const rendered = renderedStrings();
      expect(rendered).toContain('PRODUCTO');
      expect(rendered.some(isScopePair)).toBe(false);
      expect(rendered).not.toContain('CANT.');
    });

    it('uses the plural label with +N truncation and the summed quantity for 2+ items', async () => {
      prisma.outflow.findUnique.mockResolvedValue({
        ...baseOutflow,
        items: [
          {
            itemName: 'A',
            serviceTag: null,
            quantity: 1,
            unitPrice: null,
            currency: null,
            inventoryItem: null,
          },
          {
            itemName: 'B',
            serviceTag: null,
            quantity: 2,
            unitPrice: null,
            currency: null,
            inventoryItem: null,
          },
          {
            itemName: 'C',
            serviceTag: null,
            quantity: 3,
            unitPrice: null,
            currency: null,
            inventoryItem: null,
          },
          {
            itemName: 'D',
            serviceTag: null,
            quantity: 4,
            unitPrice: null,
            currency: null,
            inventoryItem: null,
          },
        ],
      } as unknown as Outflow);

      await service.generateOutflowReceipt('out-1');

      const rendered = renderedStrings();
      expect(rendered).toContain('PRODUCTOS');
      expect(rendered).toContain('A, B, C +1');
      expect(rendered).toContain('10'); // 1+2+3+4
    });
  });

  describe('generateLoanReceipt', () => {
    const baseLoan = {
      id: 'loan-1',
      number: 'P-0001',
      status: LoanStatus.RECEIVED,
      sourceWarehouse: { name: 'Bodega Central' },
      destinationWarehouse: { name: 'Bodega Norte' },
      loanDate: new Date('2026-10-01'),
      dueDate: new Date('2026-10-15'),
      createdAt: new Date('2026-10-01'),
      createdBy: { name: 'Jane', email: 'jane@test.com' },
      notes: null,
    };

    it('draws keyValues (not scope, not a table) for a single item', async () => {
      prisma.loan.findUnique.mockResolvedValue({
        ...baseLoan,
        items: [
          {
            inventoryItem: {
              name: 'Laptop Dell',
              serviceTag: null,
              price: null,
              currency: null,
            },
            quantity: 1,
          },
        ],
      } as unknown as Loan);

      await service.generateLoanReceipt('loan-1');

      const rendered = renderedStrings();
      expect(rendered).toContain('PRODUCTO');
      expect(rendered.some(isScopePair)).toBe(false);
      expect(rendered).not.toContain('CANT.');
    });

    it('uses the plural label with +N truncation and the summed quantity for 2+ items', async () => {
      prisma.loan.findUnique.mockResolvedValue({
        ...baseLoan,
        items: [
          {
            inventoryItem: {
              name: 'A',
              serviceTag: null,
              price: null,
              currency: null,
            },
            quantity: 1,
          },
          {
            inventoryItem: {
              name: 'B',
              serviceTag: null,
              price: null,
              currency: null,
            },
            quantity: 2,
          },
          {
            inventoryItem: {
              name: 'C',
              serviceTag: null,
              price: null,
              currency: null,
            },
            quantity: 3,
          },
          {
            inventoryItem: {
              name: 'D',
              serviceTag: null,
              price: null,
              currency: null,
            },
            quantity: 4,
          },
        ],
      } as unknown as Loan);

      await service.generateLoanReceipt('loan-1');

      const rendered = renderedStrings();
      expect(rendered).toContain('PRODUCTOS');
      expect(rendered).toContain('A, B, C +1');
      expect(rendered).toContain('10');
    });
  });

  describe('generateTransferReceipt', () => {
    it('does not draw a scope', async () => {
      prisma.transferRequest.findUnique.mockResolvedValue({
        id: 'trf-1',
        number: 'T-0001',
        status: RequestStatus.SENT,
        sourceWarehouse: { name: 'Bodega Central' },
        destinationWarehouse: { name: 'Bodega Norte' },
        createdAt: new Date('2026-10-01'),
        requestedBy: { name: 'Jane', email: 'jane@test.com' },
        notes: null,
        items: [
          {
            inventoryItem: {
              name: 'Switch',
              serviceTag: null,
              price: null,
              currency: null,
            },
            quantity: 3,
          },
        ],
      } as unknown as TransferRequest);

      await service.generateTransferReceipt('trf-1');

      const rendered = renderedStrings();
      expect(rendered.some(isScopePair)).toBe(false);
    });
  });

  describe('generateSaleReceipt — scope and table structure', () => {
    const mockSaleFull = {
      id: 'sale-2',
      quoteNumber: null,
      status: SaleStatus.ACTIVE,
      customerName: 'Juan Pérez',
      customerType: CustomerType.RETAIL,
      paymentCondition: 'CASH',
      createdAt: new Date('2026-01-01'),
      number: 'V-0001',
      taxPercent: new Prisma.Decimal(15),
      totalAmount: new Prisma.Decimal(100),
      taxAmount: new Prisma.Decimal(15),
      notes: null,
      createdBy: { name: 'Jane', email: 'jane@test.com' },
      warehouse: { name: 'Main' },
      client: { name: 'Juan Pérez', rtn: '0801-1985-654321' },
      items: [
        {
          itemName: 'Router TP-Link AX3000',
          serviceTag: 'SN-1234',
          quantity: 1,
          unitPrice: new Prisma.Decimal(2450),
          lineTotal: new Prisma.Decimal(2450),
          currency: 'USD',
          taxPercent: null,
          taxAmount: new Prisma.Decimal('367.50'),
          inventoryItem: null,
        },
      ],
    } as unknown as Sale;

    it('draws exactly 3 scope pairs (Cliente/RTN/Forma de pago)', async () => {
      prisma.sale.findUnique.mockResolvedValue(mockSaleFull);

      await service.generateSaleReceipt('sale-2');

      const rendered = renderedStrings();
      expect(rendered.filter(isScopePair).length).toBe(3);
    });

    it('concatenates the service tag into the item name instead of a separate column', async () => {
      prisma.sale.findUnique.mockResolvedValue(mockSaleFull);

      await service.generateSaleReceipt('sale-2');

      const rendered = renderedStrings();
      expect(rendered).toContain('Router TP-Link AX3000 · SN-1234');
      expect(rendered).not.toContain('SN-1234');
      expect(rendered).not.toContain('SERVICE TAG');
    });

    it('renders a DRAFT sale as a quotation, with the sale legal text', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        ...mockSaleFull,
        status: SaleStatus.DRAFT,
        quoteNumber: 'COT-0001',
        number: null,
      } as unknown as Sale);

      await service.generateSaleReceipt('sale-2');

      const rendered = renderedStrings();
      expect(rendered).toContain('Cotización');
      expect(rendered).toContain(
        'Documento generado automáticamente por Obsid. Este comprobante es un recibo interno de control; no sustituye una factura fiscal con CAI.',
      );
    });
  });

  // Null/undefined edge cases: every noPrice ("—") fallback branch across
  // the 5 layouts, exercised with fixtures missing the optional field.
  describe('null/undefined fallbacks render "—" instead of throwing', () => {
    it('purchase: missing supplier name/RTN/invoice number/payment condition', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue({
        id: 'inv-2',
        status: PurchaseInvoiceStatus.ACTIVE,
        supplier: null,
        invoiceNumber: null,
        paymentCondition: null,
        createdAt: new Date('2026-01-01'),
        number: 'COM-0002',
        taxPercent: null,
        totalAmount: new Prisma.Decimal(0),
        taxAmount: null,
        createdBy: { name: 'Jane', email: 'jane@test.com' },
        warehouse: { name: 'Main' },
        items: [],
      } as unknown as PurchaseInvoice);

      await service.generatePurchaseReceipt('inv-2');

      const rendered = renderedStrings();
      // 4 scope pairs (supplier/RTN/invoice/payment condition), all unknown.
      expect(rendered.filter((v) => v === '—').length).toBeGreaterThanOrEqual(
        4,
      );
    });

    it('loan: missing loanDate/dueDate and an empty item list', async () => {
      prisma.loan.findUnique.mockResolvedValue({
        id: 'loan-2',
        number: 'P-0002',
        status: LoanStatus.PENDING,
        sourceWarehouse: { name: 'Bodega Central' },
        destinationWarehouse: { name: 'Bodega Norte' },
        loanDate: null,
        dueDate: null,
        createdAt: new Date('2026-10-01'),
        createdBy: { name: 'Jane', email: 'jane@test.com' },
        items: [],
      } as unknown as Loan);

      await service.generateLoanReceipt('loan-2');

      const rendered = renderedStrings();
      // Producto (empty list), Fecha de préstamo and Devolución esperada
      // all fall back to "—".
      expect(rendered.filter((v) => v === '—').length).toBeGreaterThanOrEqual(
        3,
      );
    });

    it('outflow: missing reason', async () => {
      prisma.outflow.findUnique.mockResolvedValue({
        id: 'out-2',
        number: 'S-0002',
        status: OutflowStatus.ACTIVE,
        reason: null,
        createdAt: new Date('2026-01-01'),
        createdBy: { name: 'Jane', email: 'jane@test.com' },
        warehouse: { name: 'Bodega Central' },
        items: [
          {
            itemName: 'Router',
            serviceTag: null,
            quantity: 1,
            unitPrice: null,
            currency: null,
            inventoryItem: null,
          },
        ],
      } as unknown as Outflow);

      await service.generateOutflowReceipt('out-2');

      const rendered = renderedStrings();
      expect(rendered).toContain('—');
    });
  });

  describe('VOID watermark', () => {
    it('stamps the watermark for a CANCELLED document', async () => {
      prisma.outflow.findUnique.mockResolvedValue({
        id: 'out-3',
        number: 'S-0003',
        status: OutflowStatus.CANCELLED,
        reason: 'DAMAGED',
        createdAt: new Date('2026-01-01'),
        createdBy: { name: 'Jane', email: 'jane@test.com' },
        warehouse: { name: 'Bodega Central' },
        items: [
          {
            itemName: 'Router',
            serviceTag: null,
            quantity: 1,
            unitPrice: null,
            currency: null,
            inventoryItem: null,
          },
        ],
      } as unknown as Outflow);

      await service.generateOutflowReceipt('out-3');

      const rendered = renderedStrings();
      expect(rendered).toContain('CANCELADO');
    });

    it('stamps the REJECTED watermark label for a rejected transfer', async () => {
      prisma.transferRequest.findUnique.mockResolvedValue({
        id: 'trf-2',
        number: 'T-0002',
        status: RequestStatus.REJECTED,
        sourceWarehouse: { name: 'Bodega Central' },
        destinationWarehouse: { name: 'Bodega Norte' },
        createdAt: new Date('2026-10-01'),
        requestedBy: { name: 'Jane', email: 'jane@test.com' },
        items: [
          {
            inventoryItem: { name: 'Switch', serviceTag: null },
            quantity: 1,
          },
        ],
      } as unknown as TransferRequest);

      await service.generateTransferReceipt('trf-2');

      const rendered = renderedStrings();
      expect(rendered).toContain('RECHAZADO');
    });
  });
});
