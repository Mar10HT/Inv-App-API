import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CustomerType,
  SaleStatus,
  type Sale,
  type InventoryItem,
  type Warehouse,
} from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { SalesService } from './sales.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('SalesService', () => {
  let service: SalesService;
  let prisma: DeepMockProxy<PrismaService>;

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

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    prisma.$transaction.mockImplementation(((
      cb: (tx: DeepMockProxy<PrismaService>) => unknown,
    ) => cb(prisma)) as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: { log: jest.fn(), logSafe: jest.fn() },
        },
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
  });

  describe('getStats', () => {
    it('returns counts, breakdown by customer type and revenue by currency', async () => {
      prisma.sale.count
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(15) // active
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
      expect(result.active).toBe(15);
      expect(result.cancelled).toBe(5);
      expect(result.byCustomerType).toEqual({ RETAIL: 10, WHOLESALE: 5 });
      expect(result.revenueByCurrency).toEqual({ USD: 1234.57 });
    });
  });
});
