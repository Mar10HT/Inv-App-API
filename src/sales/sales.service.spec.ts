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
  type Sale,
  type InventoryItem,
  type Warehouse,
} from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { SalesService } from './sales.service';
import { SaleNumberingService } from './sale-numbering.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';

describe('SalesService', () => {
  let service: SalesService;
  let prisma: DeepMockProxy<PrismaService>;
  let saleNumbering: { assignNumber: jest.Mock };
  let permissions: { getPermissionsForUser: jest.Mock };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
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
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { quantity: { decrement: 2 } },
      });
    });

    it('creates a DRAFT quotation with asDraft:true, skipping the stock check/decrement and numbering entirely', async () => {
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
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.sale.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            status: SaleStatus.DRAFT,
            number: null,
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
          { id: 'client-1', creditLimit: 50 },
        ] as never);
        prisma.sale.findMany.mockResolvedValueOnce([]);

        await expect(service.create(creditDto(), 'user-1')).rejects.toThrow(
          BadRequestException,
        );
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      });

      it('blocks when the sum of other open CREDIT sales plus this one exceeds the limit', async () => {
        prisma.inventoryItem.findMany
          .mockResolvedValueOnce([mockItem])
          .mockResolvedValueOnce([mockItem]);
        prisma.$queryRaw.mockResolvedValueOnce([
          { id: 'client-1', creditLimit: 150 },
        ] as never);
        prisma.sale.findMany.mockResolvedValueOnce([
          { id: 'other-sale', totalAmount: 80, taxAmount: 0 },
        ] as never);
        prisma.payment.aggregate.mockResolvedValueOnce({
          _sum: { amount: 0 },
        } as never);

        // outstanding 80 + this sale's 100 = 180 > 150
        await expect(service.create(creditDto(), 'user-1')).rejects.toThrow(
          BadRequestException,
        );
      });

      it('is not blocked when creditLimit is null (unrestricted credit)', async () => {
        prisma.inventoryItem.findMany
          .mockResolvedValueOnce([mockItem])
          .mockResolvedValueOnce([mockItem]);
        prisma.$queryRaw.mockResolvedValueOnce([
          { id: 'client-1', creditLimit: null },
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
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
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
          { id: 'client-1', creditLimit: 50 },
        ] as never);
        prisma.sale.findMany.mockResolvedValueOnce([]);

        await expect(service.confirm('sale-1', 'user-1')).rejects.toThrow(
          BadRequestException,
        );
        expect(saleNumbering.assignNumber).not.toHaveBeenCalled();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
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
          { id: 'client-1', creditLimit: 1000 },
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
      const paidOff = {
        ...mockSale,
        id: 'paid-off',
        totalAmount: 50,
        taxAmount: 0,
      };
      const owing = {
        ...mockSale,
        id: 'owing',
        totalAmount: 100,
        taxAmount: 0,
      };
      prisma.sale.findMany.mockResolvedValueOnce([paidOff, owing] as never);
      prisma.payment.groupBy.mockResolvedValueOnce([
        { saleId: 'paid-off', _sum: { amount: 50 } },
        { saleId: 'owing', _sum: { amount: 30 } },
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
          { currency: 'USD', _sum: { totalAmount: 1234.567 } },
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
      expect(result.revenueByCurrency).toEqual({ USD: 1234.57 });
    });
  });
});
