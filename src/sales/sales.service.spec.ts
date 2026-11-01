import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CustomerType,
  SaleStatus,
  PaymentCondition,
  Prisma,
  type Sale,
  type InventoryItem,
  type Warehouse,
} from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import type { UpdateSaleDto } from './dto/update-sale.dto';
import { SalesService } from './sales.service';
import { SaleNumberingService } from './sale-numbering.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { StockLevelService } from '../alerts/stock-level.service';
import { DocumentNumberingService } from '../common/numbering/document-numbering.service';

describe('SalesService', () => {
  let service: SalesService;
  let numbering: { assignNumber: jest.Mock };
  let prisma: DeepMockProxy<PrismaService>;
  let saleNumbering: { assignNumber: jest.Mock };
  let permissions: { getPermissionsForUser: jest.Mock };
  let stockLevel: { scheduleRefresh: jest.Mock };

  // Fixtures deliberately only populate the fields each test actually reads;
  // cast once here (rather than at each mockResolvedValue call site) now that
  // `prisma` is a fully-typed DeepMockProxy<PrismaService>.
  const mockWarehouse = {
    id: 'wh-1',
    name: 'Main',
  } as unknown as Warehouse;

  const mockItem = {
    id: 'item-1',
    name: 'Widget',
    serviceTag: null,
    warehouseId: 'wh-1',
    quantity: 10,
  } as unknown as InventoryItem;

  const mockSale = {
    id: 'sale-1',
    name: null,
    warehouseId: 'wh-1',
    customerName: 'Acme',
    customerType: CustomerType.RETAIL,
    currency: 'USD',
    totalAmount: 100,
    status: SaleStatus.ACTIVE,
    notes: null,
    createdById: 'user-1',
    cancelledById: null,
    cancelledAt: null,
    cancellationReason: null,
    items: [
      {
        id: 'si-1',
        inventoryItemId: 'item-1',
        quantity: 2,
        unitPrice: 50,
        lineTotal: 100,
        itemName: 'Widget',
        serviceTag: null,
        currency: 'USD',
        notes: null,
      },
    ],
    warehouse: mockWarehouse,
  } as unknown as Sale;

  const mockDraftSale = {
    ...mockSale,
    status: SaleStatus.DRAFT,
    number: null,
  } as unknown as Sale;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    // takeStock: the conditional decrement finds the units by default
    prisma.inventoryItem.updateMany.mockResolvedValue({ count: 1 });
    // No payments on the document unless a test says otherwise
    prisma.payment.aggregate.mockResolvedValue({
      _sum: { amount: null },
    } as never);
    prisma.$transaction.mockImplementation(((
      cb: (tx: DeepMockProxy<PrismaService>) => unknown,
    ) => cb(prisma)) as never);
    saleNumbering = {
      assignNumber: jest
        .fn()
        .mockResolvedValue({ number: '001-001-01-00000001' }),
    };
    // Defaults to having sales:cancel, so existing cancel() tests (written
    // before the DRAFT/ACTIVE permission branch existed) keep passing
    // unchanged; the dedicated permission tests below override this.
    permissions = {
      getPermissionsForUser: jest.fn().mockResolvedValue(['sales:cancel']),
    };

    stockLevel = { scheduleRefresh: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: DocumentNumberingService,
          useValue: { assignNumber: jest.fn().mockResolvedValue('DOC-0001') },
        },
        SalesService,
        { provide: StockLevelService, useValue: stockLevel },
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: { log: jest.fn(), logSafe: jest.fn() },
        },
        { provide: SaleNumberingService, useValue: saleNumbering },
        { provide: PermissionsService, useValue: permissions },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
    numbering = module.get(DocumentNumberingService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const baseDto = () => ({
      warehouseId: 'wh-1',
      customerName: 'Acme',
      customerType: CustomerType.RETAIL,
      currency: 'USD',
      items: [{ inventoryItemId: 'item-1', quantity: 2, unitPrice: 50 }],
    });

    it('creates a sale, computes line/total amounts and decrements stock', async () => {
      prisma.inventoryItem.findMany
        .mockResolvedValueOnce([mockItem])
        .mockResolvedValueOnce([mockItem]);
      prisma.sale.create.mockResolvedValue(mockSale);

      const result = await service.create(baseDto(), 'user-1');

      expect(result).toEqual(mockSale);
      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            totalAmount: 100,
            items: {
              create: [
                expect.objectContaining({ unitPrice: 50, lineTotal: 100 }),
              ],
            },
          }),
        }),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'item-1', deletedAt: null, quantity: { gte: 2 } },
        data: { quantity: { decrement: 2 } },
      });
      // Stock moved: statuses and alerts must be re-evaluated.
      expect(stockLevel.scheduleRefresh).toHaveBeenCalledTimes(1);
      // A direct sale is never a quotation.
      expect(numbering.assignNumber).not.toHaveBeenCalled();
    });

    it('ignores a typed reference', async () => {
      prisma.inventoryItem.findMany
        .mockResolvedValueOnce([mockItem])
        .mockResolvedValueOnce([mockItem]);
      prisma.sale.create.mockResolvedValue(mockSale);

      await service.create({ ...baseDto(), name: 'Typed by hand' }, 'user-1');

      const { data } = prisma.sale.create.mock.calls[0][0];
      expect(data).not.toHaveProperty('name');
    });

    it('creates a DRAFT quotation with asDraft:true: a quotation number, but no stock check/decrement and no invoice number', async () => {
      // Only the outer item-existence/snapshot lookup runs for a draft — no
      // second (quantity-checking) findMany inside createInternal's tx.
      prisma.inventoryItem.findMany.mockResolvedValueOnce([mockItem]);
      prisma.sale.create.mockResolvedValue({
        ...mockSale,
        status: SaleStatus.DRAFT,
        number: null,
      });

      const result = await service.create(
        { ...baseDto(), asDraft: true },
        'user-1',
      );

      expect(result.status).toBe(SaleStatus.DRAFT);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      expect(saleNumbering.assignNumber).not.toHaveBeenCalled();
      expect(numbering.assignNumber).toHaveBeenCalledWith(prisma, 'QUOTE');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: SaleStatus.DRAFT,
            number: null,
            quoteNumber: 'DOC-0001',
          }),
        }),
      );
    });

    it('does not relax the stock cap check for a quotation with items that reference an unknown item or wrong warehouse', async () => {
      // The outer existence/warehouse validation still applies to a draft —
      // only the real-time quantity check inside createInternal is skipped.
      prisma.inventoryItem.findMany.mockResolvedValueOnce([
        { ...mockItem, warehouseId: 'other-wh' },
      ]);

      await expect(
        service.create({ ...baseDto(), asDraft: true }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rounds totals to 2 decimals', async () => {
      const dto = {
        ...baseDto(),
        items: [{ inventoryItemId: 'item-1', quantity: 3, unitPrice: 10.005 }],
      };
      prisma.inventoryItem.findMany
        .mockResolvedValueOnce([mockItem])
        .mockResolvedValueOnce([mockItem]);
      prisma.sale.create.mockResolvedValue(mockSale);

      await service.create(dto, 'user-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ totalAmount: 30.02 }),
        }),
      );
    });

    it('rounds ISV 15% of 33.33 half-up to 5.00, not 4.99 (33.33 * 0.15 = 4.9995)', async () => {
      const dto = {
        ...baseDto(),
        taxPercent: 15,
        items: [{ inventoryItemId: 'item-1', quantity: 1, unitPrice: 33.33 }],
      };
      prisma.inventoryItem.findMany
        .mockResolvedValueOnce([mockItem])
        .mockResolvedValueOnce([mockItem]);
      prisma.sale.create.mockResolvedValue(mockSale);

      await service.create(dto, 'user-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            totalAmount: 33.33,
            taxAmount: 5,
            items: {
              create: [expect.objectContaining({ taxAmount: 5 })],
            },
          }),
        }),
      );
    });

    it('throws ForbiddenException when user has no access to the warehouse', async () => {
      await expect(
        service.create(baseDto(), 'user-1', ['other-wh']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when items are empty', async () => {
      await expect(
        service.create({ ...baseDto(), items: [] }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException on duplicate items in payload', async () => {
      await expect(
        service.create(
          {
            ...baseDto(),
            items: [
              { inventoryItemId: 'item-1', quantity: 1, unitPrice: 10 },
              { inventoryItemId: 'item-1', quantity: 1, unitPrice: 10 },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when an item does not exist', async () => {
      prisma.inventoryItem.findMany.mockResolvedValueOnce([]);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when item belongs to a different warehouse', async () => {
      prisma.inventoryItem.findMany.mockResolvedValueOnce([
        { ...mockItem, warehouseId: 'other-wh' },
      ]);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when stock is insufficient', async () => {
      prisma.inventoryItem.findMany
        .mockResolvedValueOnce([mockItem])
        .mockResolvedValueOnce([{ ...mockItem, quantity: 1 }]);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    describe('credit limit', () => {
      const creditDto = () => ({
        ...baseDto(),
        clientId: 'client-1',
        paymentCondition: PaymentCondition.CREDIT,
      });

      it('blocks a credit sale whose own amount alone exceeds the limit, touching no stock', async () => {
        prisma.inventoryItem.findMany
          .mockResolvedValueOnce([mockItem])
          .mockResolvedValueOnce([mockItem]);
        prisma.$queryRaw.mockResolvedValueOnce([
          {
            id: 'client-1',
            creditLimit: new Prisma.Decimal(50),
            creditLimitCurrency: 'USD',
          },
        ] as never);
        prisma.sale.findMany.mockResolvedValueOnce([]);

        await expect(
          service.create(creditDto(), 'user-1'),
        ).rejects.toMatchObject({
          response: { code: 'CREDIT_LIMIT_EXCEEDED' },
        });
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
      });

      it('refuses a credit sale in a currency other than the limit, touching no stock', async () => {
        prisma.inventoryItem.findMany
          .mockResolvedValueOnce([mockItem])
          .mockResolvedValueOnce([mockItem]);
        prisma.$queryRaw.mockResolvedValueOnce([
          {
            id: 'client-1',
            creditLimit: new Prisma.Decimal(1000),
            creditLimitCurrency: 'HNL',
          },
        ] as never);

        await expect(
          service.create(creditDto(), 'user-1'),
        ).rejects.toMatchObject({
          response: {
            code: 'CREDIT_LIMIT_CURRENCY_MISMATCH',
            params: { limitCurrency: 'HNL', saleCurrency: 'USD' },
          },
        });
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(prisma.sale.findMany).not.toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
      });

      it('only adds up open credit sales in the limit currency', async () => {
        prisma.inventoryItem.findMany
          .mockResolvedValueOnce([mockItem])
          .mockResolvedValueOnce([mockItem]);
        prisma.$queryRaw.mockResolvedValueOnce([
          {
            id: 'client-1',
            creditLimit: new Prisma.Decimal(1000),
            creditLimitCurrency: 'USD',
          },
        ] as never);
        prisma.sale.findMany.mockResolvedValueOnce([]);
        prisma.sale.create.mockResolvedValue(mockSale);

        await service.create(creditDto(), 'user-1');

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(prisma.sale.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            where: expect.objectContaining({ currency: 'USD' }),
          }),
        );
      });

      it('blocks when the sum of other open CREDIT sales plus this one exceeds the limit', async () => {
        prisma.inventoryItem.findMany
          .mockResolvedValueOnce([mockItem])
          .mockResolvedValueOnce([mockItem]);
        prisma.$queryRaw.mockResolvedValueOnce([
          {
            id: 'client-1',
            creditLimit: new Prisma.Decimal(150),
            creditLimitCurrency: 'USD',
          },
        ] as never);
        prisma.sale.findMany.mockResolvedValueOnce([
          {
            id: 'other-sale',
            totalAmount: new Prisma.Decimal(80),
            taxAmount: new Prisma.Decimal(0),
          },
        ] as never);
        prisma.payment.aggregate.mockResolvedValueOnce({
          _sum: { amount: new Prisma.Decimal(0) },
        } as never);

        // outstanding 80 + this sale's 100 = 180 > 150
        await expect(
          service.create(creditDto(), 'user-1'),
        ).rejects.toMatchObject({
          response: { code: 'CREDIT_LIMIT_EXCEEDED' },
        });
      });

      it('allows a credit sale that projects exactly to the limit (strict > comparison)', async () => {
        prisma.inventoryItem.findMany
          .mockResolvedValueOnce([mockItem])
          .mockResolvedValueOnce([mockItem]);
        prisma.$queryRaw.mockResolvedValueOnce([
          {
            id: 'client-1',
            creditLimit: new Prisma.Decimal('1000.00'),
            creditLimitCurrency: 'USD',
          },
        ] as never);
        prisma.sale.findMany.mockResolvedValueOnce([]);
        prisma.sale.create.mockResolvedValue(mockSale);

        await expect(
          service.create(
            {
              ...creditDto(),
              items: [
                { inventoryItemId: 'item-1', quantity: 1, unitPrice: 1000 },
              ],
            },
            'user-1',
          ),
        ).resolves.toBeDefined();
      });

      it('blocks a credit sale that projects one cent over the limit', async () => {
        prisma.inventoryItem.findMany
          .mockResolvedValueOnce([mockItem])
          .mockResolvedValueOnce([mockItem]);
        prisma.$queryRaw.mockResolvedValueOnce([
          {
            id: 'client-1',
            creditLimit: new Prisma.Decimal('1000.00'),
            creditLimitCurrency: 'USD',
          },
        ] as never);
        prisma.sale.findMany.mockResolvedValueOnce([]);

        await expect(
          service.create(
            {
              ...creditDto(),
              items: [
                {
                  inventoryItemId: 'item-1',
                  quantity: 1,
                  unitPrice: 1000.01,
                },
              ],
            },
            'user-1',
          ),
        ).rejects.toMatchObject({
          response: { code: 'CREDIT_LIMIT_EXCEEDED' },
        });
      });

      it('is not blocked when creditLimit is null (unrestricted credit)', async () => {
        prisma.inventoryItem.findMany
          .mockResolvedValueOnce([mockItem])
          .mockResolvedValueOnce([mockItem]);
        prisma.$queryRaw.mockResolvedValueOnce([
          { id: 'client-1', creditLimit: null, creditLimitCurrency: 'USD' },
        ] as never);
        prisma.sale.create.mockResolvedValue(mockSale);

        await expect(
          service.create(creditDto(), 'user-1'),
        ).resolves.toBeDefined();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(prisma.sale.findMany).not.toHaveBeenCalled();
      });

      it('is not blocked for a CASH sale even with a clientId and a tight creditLimit — the check never runs', async () => {
        prisma.inventoryItem.findMany
          .mockResolvedValueOnce([mockItem])
          .mockResolvedValueOnce([mockItem]);
        prisma.sale.create.mockResolvedValue(mockSale);

        await expect(
          service.create(
            {
              ...baseDto(),
              clientId: 'client-1',
              paymentCondition: PaymentCondition.CASH,
            },
            'user-1',
          ),
        ).resolves.toBeDefined();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
      });

      it('is not blocked without a clientId regardless of paymentCondition', async () => {
        prisma.inventoryItem.findMany
          .mockResolvedValueOnce([mockItem])
          .mockResolvedValueOnce([mockItem]);
        prisma.sale.create.mockResolvedValue(mockSale);

        await expect(
          service.create(
            { ...baseDto(), paymentCondition: PaymentCondition.CREDIT },
            'user-1',
          ),
        ).resolves.toBeDefined();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
      });
    });
  });

  describe('findOne', () => {
    it('returns the sale', async () => {
      prisma.sale.findUnique.mockResolvedValue(mockSale);

      const result = await service.findOne('sale-1');

      expect(result).toEqual(mockSale);
    });

    it('throws NotFoundException when missing', async () => {
      prisma.sale.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user has no access to the warehouse', async () => {
      prisma.sale.findUnique.mockResolvedValue(mockSale);

      await expect(service.findOne('sale-1', ['other-wh'])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('includes the linked client (id + name)', async () => {
      prisma.sale.findUnique.mockResolvedValue(mockSale);

      await service.findOne('sale-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          include: expect.objectContaining({
            client: { select: { id: true, name: true } },
          }),
        }),
      );
    });
  });

  describe('update', () => {
    it('replaces fields and items on a DRAFT and recomputes totals', async () => {
      prisma.sale.findUnique
        .mockResolvedValueOnce(mockDraftSale) // findOne() access check
        .mockResolvedValueOnce(mockDraftSale); // inside the transaction
      prisma.inventoryItem.findMany.mockResolvedValueOnce([mockItem]);
      prisma.sale.update.mockResolvedValue(mockDraftSale);

      await service.update(
        'sale-1',
        { items: [{ inventoryItemId: 'item-1', quantity: 3, unitPrice: 20 }] },
        'user-1',
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sale-1' },
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ totalAmount: 60 }),
        }),
      );
    });

    const draftForClient = {
      ...mockDraftSale,
      clientId: 'client-1',
      paymentCondition: PaymentCondition.CREDIT,
    } as unknown as Sale;

    it('keeps the client and payment condition when the edit leaves them out', async () => {
      prisma.sale.findUnique
        .mockResolvedValueOnce(draftForClient)
        .mockResolvedValueOnce(draftForClient);
      prisma.$queryRaw.mockResolvedValueOnce([
        { id: 'client-1', creditLimit: null, creditLimitCurrency: 'USD' },
      ] as never);
      prisma.sale.update.mockResolvedValue(draftForClient);

      await service.update('sale-1', { notes: 'x' }, 'user-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            clientId: 'client-1',
            paymentCondition: PaymentCondition.CREDIT,
          }),
        }),
      );
    });

    it('drops the client when the edit clears it', async () => {
      prisma.sale.findUnique
        .mockResolvedValueOnce(draftForClient)
        .mockResolvedValueOnce(draftForClient);
      prisma.sale.update.mockResolvedValue(mockDraftSale);

      await service.update(
        'sale-1',
        { clientId: null } as unknown as UpdateSaleDto,
        'user-1',
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ clientId: null }),
        }),
      );
    });

    it('refuses to move a quotation to a warehouse the user cannot access', async () => {
      prisma.sale.findUnique.mockResolvedValue(mockDraftSale);

      await expect(
        service.update('sale-1', { warehouseId: 'wh-2' }, 'user-1', ['wh-1']),
      ).rejects.toThrow(ForbiddenException);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.update).not.toHaveBeenCalled();
    });

    it('refuses to move a quotation whose lines are stocked in the old warehouse', async () => {
      prisma.sale.findUnique
        .mockResolvedValueOnce(mockDraftSale)
        .mockResolvedValueOnce(mockDraftSale);
      prisma.inventoryItem.findMany.mockResolvedValueOnce([
        { id: 'item-1', warehouseId: 'wh-1' },
      ] as never);

      await expect(
        service.update('sale-1', { warehouseId: 'wh-2' }, 'user-1'),
      ).rejects.toMatchObject({ response: { code: 'ITEM_NOT_IN_WAREHOUSE' } });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the sale is not a DRAFT', async () => {
      prisma.sale.findUnique
        .mockResolvedValueOnce(mockSale)
        .mockResolvedValueOnce(mockSale);

      await expect(
        service.update('sale-1', { notes: 'x' }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when user has no access to the warehouse', async () => {
      prisma.sale.findUnique.mockResolvedValue(mockDraftSale);

      await expect(
        service.update('sale-1', { notes: 'x' }, 'user-1', ['other-wh']),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('confirm', () => {
    it('sums ~100 Decimal-backed line totals correctly (DB rows return Prisma.Decimal, not plain numbers, once the schema is migrated)', async () => {
      // Regression for the Float -> Decimal migration: current.items here
      // comes straight from a Prisma read (tx.sale.findUnique), so
      // lineTotal is a Prisma.Decimal at runtime, not a plain number.
      // Without round2/sum/toNumber, `items.reduce((sum, i) => sum + i.lineTotal, 0)`
      // concatenates each line as a string instead of adding it — 100 lines
      // of "0.01" would corrupt the total into garbage that round2() can't
      // even parse back into a number, instead of the correct 1.00.
      const manyItems = Array.from({ length: 100 }, (_, i) => ({
        id: `si-${i}`,
        inventoryItemId: 'item-1',
        quantity: 1,
        unitPrice: new Prisma.Decimal('0.01'),
        lineTotal: new Prisma.Decimal('0.01'),
        taxPercent: null,
        itemName: 'Widget',
        serviceTag: null,
        currency: 'USD',
        notes: null,
      }));
      const draftWithManyItems = {
        ...mockDraftSale,
        taxPercent: null,
        items: manyItems,
      };
      prisma.sale.findUnique
        .mockResolvedValueOnce(draftWithManyItems as never)
        .mockResolvedValueOnce(draftWithManyItems as never);
      prisma.inventoryItem.findMany.mockResolvedValueOnce([mockItem]);
      prisma.sale.update.mockResolvedValue(draftWithManyItems as never);

      await service.confirm('sale-1', 'user-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({ totalAmount: 1, taxAmount: 0 }),
        }),
      );
    });

    it('assigns a number, decrements stock and sets status ACTIVE', async () => {
      prisma.sale.findUnique
        .mockResolvedValueOnce(mockDraftSale) // findOne() access check
        .mockResolvedValueOnce(mockDraftSale); // inside the transaction
      prisma.inventoryItem.findMany.mockResolvedValueOnce([mockItem]);
      prisma.sale.update.mockResolvedValue({
        ...mockDraftSale,
        status: SaleStatus.ACTIVE,
        number: '001-001-01-00000001',
      });

      const result = await service.confirm('sale-1', 'user-1');

      expect(result.status).toBe(SaleStatus.ACTIVE);
      expect(result.number).toBe('001-001-01-00000001');
      expect(saleNumbering.assignNumber).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
        where: { id: 'item-1', deletedAt: null, quantity: { gte: 2 } },
        data: { quantity: { decrement: 2 } },
      });
    });

    it('throws BadRequestException on insufficient stock, without assigning a number', async () => {
      prisma.sale.findUnique
        .mockResolvedValueOnce(mockDraftSale)
        .mockResolvedValueOnce(mockDraftSale);
      prisma.inventoryItem.findMany.mockResolvedValueOnce([
        { ...mockItem, quantity: 1 },
      ]);

      await expect(service.confirm('sale-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(saleNumbering.assignNumber).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the sale is not a DRAFT', async () => {
      prisma.sale.findUnique
        .mockResolvedValueOnce(mockSale)
        .mockResolvedValueOnce(mockSale);

      await expect(service.confirm('sale-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when user has no access to the warehouse', async () => {
      prisma.sale.findUnique.mockResolvedValue(mockDraftSale);

      await expect(
        service.confirm('sale-1', 'user-1', ['other-wh']),
      ).rejects.toThrow(ForbiddenException);
    });

    describe('credit limit', () => {
      it('blocks confirming when the amount exceeds the client credit limit — status stays DRAFT, no number assigned, no stock touched', async () => {
        const draftWithClient = {
          ...mockDraftSale,
          clientId: 'client-1',
          paymentCondition: PaymentCondition.CREDIT,
        };
        prisma.sale.findUnique
          .mockResolvedValueOnce(draftWithClient)
          .mockResolvedValueOnce(draftWithClient);
        prisma.$queryRaw.mockResolvedValueOnce([
          {
            id: 'client-1',
            creditLimit: new Prisma.Decimal(50),
            creditLimitCurrency: 'USD',
          },
        ] as never);
        prisma.sale.findMany.mockResolvedValueOnce([]);

        await expect(service.confirm('sale-1', 'user-1')).rejects.toMatchObject(
          { response: { code: 'CREDIT_LIMIT_EXCEEDED' } },
        );
        expect(saleNumbering.assignNumber).not.toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(prisma.inventoryItem.updateMany).not.toHaveBeenCalled();
      });

      it("excludes the sale itself from the sum of the client's other open CREDIT sales", async () => {
        const draftWithClient = {
          ...mockDraftSale,
          id: 'sale-1',
          clientId: 'client-1',
          paymentCondition: PaymentCondition.CREDIT,
        };
        prisma.sale.findUnique
          .mockResolvedValueOnce(draftWithClient)
          .mockResolvedValueOnce(draftWithClient);
        prisma.inventoryItem.findMany.mockResolvedValueOnce([mockItem]);
        prisma.$queryRaw.mockResolvedValueOnce([
          {
            id: 'client-1',
            creditLimit: new Prisma.Decimal(1000),
            creditLimitCurrency: 'USD',
          },
        ] as never);
        prisma.sale.findMany.mockResolvedValueOnce([]);
        prisma.sale.update.mockResolvedValue({
          ...draftWithClient,
          status: SaleStatus.ACTIVE,
        });

        await service.confirm('sale-1', 'user-1');

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(prisma.sale.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            where: expect.objectContaining({ id: { not: 'sale-1' } }),
          }),
        );
      });
    });
  });

  describe('cancel', () => {
    it('restores stock and marks the sale CANCELLED', async () => {
      prisma.sale.findUnique
        .mockResolvedValueOnce(mockSale)
        .mockResolvedValueOnce(mockSale);
      prisma.sale.update.mockResolvedValue({
        ...mockSale,
        status: SaleStatus.CANCELLED,
      });

      const result = await service.cancel('sale-1', 'user-2', 'Returned');

      expect(result.status).toBe(SaleStatus.CANCELLED);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { quantity: { increment: 2 } },
      });
      expect(stockLevel.scheduleRefresh).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException when sale is already CANCELLED', async () => {
      const cancelledSale = { ...mockSale, status: SaleStatus.CANCELLED };
      prisma.sale.findUnique
        .mockResolvedValueOnce(cancelledSale)
        .mockResolvedValueOnce(cancelledSale);

      await expect(service.cancel('sale-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when user has no access to the warehouse', async () => {
      prisma.sale.findUnique.mockResolvedValue(mockSale);

      await expect(
        service.cancel('sale-1', 'user-2', undefined, ['other-wh']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('cancels a DRAFT with no stock to restore and no extra permission check', async () => {
      prisma.sale.findUnique
        .mockResolvedValueOnce(mockDraftSale)
        .mockResolvedValueOnce(mockDraftSale);
      prisma.sale.update.mockResolvedValue({
        ...mockDraftSale,
        status: SaleStatus.CANCELLED,
      });

      const result = await service.cancel('sale-1', 'user-2');

      expect(result.status).toBe(SaleStatus.CANCELLED);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      expect(permissions.getPermissionsForUser).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException cancelling an ACTIVE sale when the caller only has sales:create', async () => {
      permissions.getPermissionsForUser.mockResolvedValue(['sales:create']);
      prisma.sale.findUnique
        .mockResolvedValueOnce(mockSale)
        .mockResolvedValueOnce(mockSale);

      await expect(service.cancel('sale-1', 'user-2')).rejects.toThrow(
        ForbiddenException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });

    it('allows cancelling an ACTIVE sale for a caller with the SYSTEM_ADMIN wildcard', async () => {
      permissions.getPermissionsForUser.mockResolvedValue(['*']);
      prisma.sale.findUnique
        .mockResolvedValueOnce(mockSale)
        .mockResolvedValueOnce(mockSale);
      prisma.sale.update.mockResolvedValue({
        ...mockSale,
        status: SaleStatus.CANCELLED,
      });

      const result = await service.cancel('sale-1', 'user-2');

      expect(result.status).toBe(SaleStatus.CANCELLED);
    });

    it('throws BadRequestException with SALE_HAS_ACTIVE_PAYMENTS when the sale has active payments', async () => {
      prisma.sale.findUnique
        .mockResolvedValueOnce(mockSale)
        .mockResolvedValueOnce(mockSale);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal('50.00') },
      } as never);

      await expect(service.cancel('sale-1', 'user-2')).rejects.toMatchObject({
        response: { code: 'SALE_HAS_ACTIVE_PAYMENTS' },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.update).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('includes the linked client (id + name), so Accounts Receivable can show who owes', async () => {
      prisma.sale.findMany.mockResolvedValueOnce([]);
      prisma.sale.count.mockResolvedValueOnce(0);
      prisma.payment.groupBy.mockResolvedValueOnce([]);

      await service.findAll({} as never);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          include: expect.objectContaining({
            client: { select: { id: true, name: true } },
          }),
        }),
      );
    });

    it('with onlyWithBalance returns only ACTIVE sales whose balance is greater than zero', async () => {
      // totalAmount/taxAmount/_sum.amount are Prisma.Decimal here, the real
      // runtime shape once these columns are numeric(14,2) — plain numbers
      // would let a broken `+`/`-` on these pass this test by accident.
      const paidOff = {
        ...mockSale,
        id: 'paid-off',
        totalAmount: new Prisma.Decimal(50),
        taxAmount: new Prisma.Decimal(0),
      };
      const owing = {
        ...mockSale,
        id: 'owing',
        totalAmount: new Prisma.Decimal(100),
        taxAmount: new Prisma.Decimal(0),
      };
      prisma.sale.findMany.mockResolvedValueOnce([paidOff, owing] as never);
      prisma.payment.groupBy.mockResolvedValueOnce([
        { saleId: 'paid-off', _sum: { amount: new Prisma.Decimal(50) } },
        { saleId: 'owing', _sum: { amount: new Prisma.Decimal(30) } },
      ] as never);

      const result = await service.findAll({ onlyWithBalance: true } as never);

      expect(
        result.data.map((s) => (s as unknown as { id: string }).id),
      ).toEqual(['owing']);
    });
  });

  describe('getStats', () => {
    it('returns counts (including draft), breakdown by customer type and revenue by currency', async () => {
      prisma.sale.count
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(12) // active
        .mockResolvedValueOnce(3) // draft
        .mockResolvedValueOnce(5); // cancelled
      prisma.sale.groupBy
        .mockResolvedValueOnce([
          { customerType: CustomerType.RETAIL, _count: { _all: 10 } },
          { customerType: CustomerType.WHOLESALE, _count: { _all: 5 } },
        ] as never)
        .mockResolvedValueOnce([
          {
            currency: 'USD',
            _sum: {
              totalAmount: new Prisma.Decimal('1234.567'),
              taxAmount: new Prisma.Decimal('185.18'),
            },
          },
          {
            currency: 'HNL',
            _sum: { totalAmount: new Prisma.Decimal(100), taxAmount: null },
          },
        ] as never);

      const result = await service.getStats();

      expect(result.total).toBe(20);
      expect(result.active).toBe(12);
      expect(result.draft).toBe(3);
      expect(result.cancelled).toBe(5);
      expect(result.total).toBe(
        result.active + result.draft + result.cancelled,
      );
      expect(result.byCustomerType).toEqual({ RETAIL: 10, WHOLESALE: 5 });
      // Grand totals: subtotal plus tax, per currency
      expect(result.revenueByCurrency).toEqual({ USD: 1419.75, HNL: 100 });
    });
  });
});
