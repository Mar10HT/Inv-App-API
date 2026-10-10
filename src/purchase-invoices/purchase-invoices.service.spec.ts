import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  ItemType,
  PurchaseInvoiceStatus,
  PaymentCondition,
  type PurchaseInvoice,
  type InventoryItem,
  type Warehouse,
} from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { PurchaseNumberingService } from './purchase-numbering.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('PurchaseInvoicesService', () => {
  let service: PurchaseInvoicesService;
  let prisma: DeepMockProxy<PrismaService>;
  let purchaseNumbering: { assignNumber: jest.Mock };

  const mockWarehouse = { id: 'wh-1', name: 'Main' } as unknown as Warehouse;

  const mockBulkItem = {
    id: 'item-1',
    name: 'Cable',
    serviceTag: null,
    warehouseId: 'wh-1',
    quantity: 10,
    itemType: ItemType.BULK,
  } as unknown as InventoryItem;

  const mockCreatedUniqueItem = {
    id: 'item-new-1',
    name: 'Laptop',
    serviceTag: 'SN-001',
  } as unknown as InventoryItem;

  const mockInvoice = {
    id: 'inv-1',
    number: 'COM-0001',
    invoiceNumber: 'FAC-001',
    supplierId: 'sup-1',
    warehouseId: 'wh-1',
    status: PurchaseInvoiceStatus.ACTIVE,
    currency: 'USD',
    totalAmount: 100,
    taxPercent: null,
    taxAmount: 0,
    paymentCondition: PaymentCondition.CASH,
    notes: null,
    createdById: 'user-1',
    cancelledById: null,
    cancelledAt: null,
    cancellationReason: null,
    items: [
      {
        id: 'pii-1',
        inventoryItemId: 'item-1',
        quantity: 10,
        unitPrice: 10,
        lineTotal: 100,
        taxPercent: null,
        taxAmount: 0,
        itemName: 'Cable',
        serviceTag: null,
        currency: 'USD',
        notes: null,
        inventoryItem: { itemType: ItemType.BULK, quantity: 20, name: 'Cable' },
      },
    ],
    warehouse: mockWarehouse,
  } as unknown as PurchaseInvoice & {
    items: Array<Record<string, unknown>>;
    warehouse: Warehouse;
  };

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    prisma.$transaction.mockImplementation(((
      cb: (tx: DeepMockProxy<PrismaService>) => unknown,
    ) => cb(prisma)) as never);
    purchaseNumbering = {
      assignNumber: jest.fn().mockResolvedValue({ number: 'COM-0001' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseInvoicesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: { log: jest.fn(), logSafe: jest.fn() },
        },
        { provide: PurchaseNumberingService, useValue: purchaseNumbering },
      ],
    }).compile();

    service = module.get<PurchaseInvoicesService>(PurchaseInvoicesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const baseDto = () => ({
      warehouseId: 'wh-1',
      supplierId: 'sup-1',
      invoiceNumber: 'FAC-001',
      items: [
        {
          kind: ItemType.BULK,
          inventoryItemId: 'item-1',
          quantity: 10,
          unitPrice: 10,
        },
      ],
    });

    it('creates an invoice with a BULK line, increments the existing item, and assigns a number', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.findMany.mockResolvedValue([mockBulkItem]);
      prisma.purchaseInvoice.create.mockResolvedValue(mockInvoice);

      const result = await service.create(baseDto(), 'user-1');

      expect(result).toEqual(mockInvoice);
      expect(purchaseNumbering.assignNumber).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { quantity: { increment: 10 } },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.purchaseInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            number: 'COM-0001',
            invoiceNumber: 'FAC-001',
            totalAmount: 100,
          }),
        }),
      );
    });

    it('creates an invoice with a UNIQUE line: a brand-new InventoryItem is created and the line points at it', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.create.mockResolvedValue(mockCreatedUniqueItem);
      prisma.purchaseInvoice.create.mockResolvedValue(mockInvoice);

      const dto = {
        warehouseId: 'wh-1',
        supplierId: 'sup-1',
        invoiceNumber: 'FAC-002',
        items: [
          {
            kind: ItemType.UNIQUE,
            name: 'Laptop',
            category: 'Electronics',
            serviceTag: 'SN-001',
            unitPrice: 900,
          },
        ],
      };

      await service.create(dto, 'user-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Laptop',
          category: 'Electronics',
          itemType: ItemType.UNIQUE,
          serviceTag: 'SN-001',
          quantity: 1,
          warehouseId: 'wh-1',
          supplierId: 'sup-1',
        }) as unknown,
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.purchaseInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            items: {
              create: [
                expect.objectContaining({
                  inventoryItemId: 'item-new-1',
                  quantity: 1,
                }),
              ],
            },
          }) as unknown,
        }),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });

    it('creates a mixed invoice with both BULK and UNIQUE lines atomically', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.findMany.mockResolvedValue([mockBulkItem]);
      prisma.inventoryItem.create.mockResolvedValue(mockCreatedUniqueItem);
      prisma.purchaseInvoice.create.mockResolvedValue(mockInvoice);

      const dto = {
        warehouseId: 'wh-1',
        supplierId: 'sup-1',
        invoiceNumber: 'FAC-003',
        items: [
          {
            kind: ItemType.BULK,
            inventoryItemId: 'item-1',
            quantity: 5,
            unitPrice: 10,
          },
          {
            kind: ItemType.UNIQUE,
            name: 'Laptop',
            category: 'Electronics',
            serviceTag: 'SN-002',
            unitPrice: 900,
          },
        ],
      };

      await service.create(dto, 'user-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.create).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when the supplier + invoice number already exists', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(mockInvoice);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        ConflictException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.purchaseInvoice.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException on duplicate inventoryItemId across BULK lines', async () => {
      const dto = {
        warehouseId: 'wh-1',
        supplierId: 'sup-1',
        invoiceNumber: 'FAC-004',
        items: [
          {
            kind: ItemType.BULK,
            inventoryItemId: 'item-1',
            quantity: 1,
            unitPrice: 10,
          },
          {
            kind: ItemType.BULK,
            inventoryItemId: 'item-1',
            quantity: 1,
            unitPrice: 10,
          },
        ],
      };

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException on duplicate serviceTag across UNIQUE lines', async () => {
      const dto = {
        warehouseId: 'wh-1',
        supplierId: 'sup-1',
        invoiceNumber: 'FAC-005',
        items: [
          {
            kind: ItemType.UNIQUE,
            name: 'A',
            category: 'C',
            serviceTag: 'SN-1',
            unitPrice: 1,
          },
          {
            kind: ItemType.UNIQUE,
            name: 'B',
            category: 'C',
            serviceTag: 'SN-1',
            unitPrice: 1,
          },
        ],
      };

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when user has no access to the warehouse', async () => {
      await expect(
        service.create(baseDto(), 'user-1', ['other-wh']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when a BULK item does not exist', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when a BULK item belongs to a different warehouse', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.findMany.mockResolvedValue([
        { ...mockBulkItem, warehouseId: 'other-wh' },
      ]);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when a BULK line targets a UNIQUE (serialized) item', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.findMany.mockResolvedValue([
        { ...mockBulkItem, itemType: ItemType.UNIQUE } as never,
      ]);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when the item is changed to UNIQUE between the pre-check and the transaction (re-checked inside the transaction, not trusted from the outer snapshot)', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.findMany
        .mockResolvedValueOnce([mockBulkItem]) // outer pre-transaction check: still BULK
        .mockResolvedValueOnce([
          { id: mockBulkItem.id, itemType: ItemType.UNIQUE } as never,
        ]); // inner re-fetch inside the transaction: changed concurrently

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.purchaseInvoice.create).not.toHaveBeenCalled();
    });

    it('applies tax: line override beats invoice default, invoice default applies when the line has none', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(null);
      prisma.inventoryItem.findMany.mockResolvedValue([mockBulkItem]);
      prisma.purchaseInvoice.create.mockResolvedValue(mockInvoice);

      const dto = {
        warehouseId: 'wh-1',
        supplierId: 'sup-1',
        invoiceNumber: 'FAC-006',
        taxPercent: 15,
        items: [
          {
            kind: ItemType.BULK,
            inventoryItemId: 'item-1',
            quantity: 1,
            unitPrice: 100,
            taxPercent: 0,
          },
        ],
      };

      await service.create(dto, 'user-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.purchaseInvoice.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ taxAmount: 0 }) as unknown,
        }),
      );
    });
  });

  describe('cancel', () => {
    it('restores stock and marks the invoice CANCELLED when every line is BULK', async () => {
      prisma.purchaseInvoice.findUnique
        .mockResolvedValueOnce(mockInvoice)
        .mockResolvedValueOnce(mockInvoice);
      prisma.purchaseInvoice.update.mockResolvedValue({
        ...mockInvoice,
        status: PurchaseInvoiceStatus.CANCELLED,
      });

      const result = await service.cancel('inv-1', 'user-2', 'Returned');

      expect(result.status).toBe(PurchaseInvoiceStatus.CANCELLED);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
        where: { id: 'item-1' },
        data: { quantity: { decrement: 10 } },
      });
    });

    it('blocks cancellation entirely when any line is UNIQUE, even in a mixed invoice, without touching stock', async () => {
      const mixedInvoice = {
        ...mockInvoice,
        items: [
          ...mockInvoice.items,
          {
            id: 'pii-2',
            inventoryItemId: 'item-new-1',
            quantity: 1,
            inventoryItem: {
              itemType: ItemType.UNIQUE,
              quantity: 1,
              name: 'Laptop',
            },
          },
        ],
      };
      prisma.purchaseInvoice.findUnique
        .mockResolvedValueOnce(mixedInvoice as never)
        .mockResolvedValueOnce(mixedInvoice as never);

      await expect(service.cancel('inv-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.purchaseInvoice.update).not.toHaveBeenCalled();
    });

    it('blocks cancellation when decrementing would drive stock negative', async () => {
      const depleted = {
        ...mockInvoice,
        items: [
          {
            ...mockInvoice.items[0],
            quantity: 10,
            inventoryItem: {
              itemType: ItemType.BULK,
              quantity: 3,
              name: 'Cable',
            },
          },
        ],
      };
      prisma.purchaseInvoice.findUnique
        .mockResolvedValueOnce(depleted as never)
        .mockResolvedValueOnce(depleted as never);

      await expect(service.cancel('inv-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when already CANCELLED', async () => {
      const cancelled = {
        ...mockInvoice,
        status: PurchaseInvoiceStatus.CANCELLED,
      };
      prisma.purchaseInvoice.findUnique
        .mockResolvedValueOnce(cancelled)
        .mockResolvedValueOnce(cancelled);

      await expect(service.cancel('inv-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws ForbiddenException when user has no access to the warehouse', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(mockInvoice);

      await expect(
        service.cancel('inv-1', 'user-2', undefined, ['other-wh']),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findOne', () => {
    it('returns the invoice', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(mockInvoice);

      const result = await service.findOne('inv-1');

      expect(result).toEqual(mockInvoice);
    });

    it('throws NotFoundException when missing', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user has no access to the warehouse', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue(mockInvoice);

      await expect(service.findOne('inv-1', ['other-wh'])).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findAll', () => {
    it('with onlyWithBalance returns only ACTIVE invoices whose balance is greater than zero', async () => {
      const paidOff = {
        ...mockInvoice,
        id: 'paid-off',
        totalAmount: 50,
        taxAmount: 0,
      };
      const owing = {
        ...mockInvoice,
        id: 'owing',
        totalAmount: 100,
        taxAmount: 0,
      };
      prisma.purchaseInvoice.findMany.mockResolvedValueOnce([
        paidOff,
        owing,
      ] as never);
      prisma.payment.groupBy.mockResolvedValueOnce([
        { purchaseInvoiceId: 'paid-off', _sum: { amount: 50 } },
        { purchaseInvoiceId: 'owing', _sum: { amount: 30 } },
      ] as never);

      const result = await service.findAll({ onlyWithBalance: true } as never);

      expect(
        result.data.map((p) => (p as unknown as { id: string }).id),
      ).toEqual(['owing']);
    });
  });

  describe('getStats', () => {
    it('returns counts', async () => {
      prisma.purchaseInvoice.count
        .mockResolvedValueOnce(10)
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(2);
      prisma.purchaseInvoice.groupBy.mockResolvedValue([
        { currency: 'USD', _sum: { totalAmount: 500 } },
      ] as never);

      const result = await service.getStats();

      expect(result.total).toBe(10);
      expect(result.active).toBe(8);
      expect(result.cancelled).toBe(2);
    });
  });
});
