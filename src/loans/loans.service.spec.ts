import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Prisma,
  type Loan,
  type LoanItem,
  type InventoryItem,
  type Warehouse,
} from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { LoansService } from './loans.service';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from '../qr/qr.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../audit/audit.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('test error', {
    code,
    clientVersion: '6.x',
  });

describe('LoansService', () => {
  let service: LoansService;
  let prisma: DeepMockProxy<PrismaService>;

  // Fixtures deliberately only populate the fields each test actually reads;
  // cast once here (rather than at each mockResolvedValue call site) now that
  // `prisma` is a fully-typed DeepMockProxy<PrismaService>.
  const mockWarehouse = {
    id: 'w-src',
    name: 'Source',
    location: 'A',
  } as unknown as Warehouse;
  const mockDestWarehouse = {
    id: 'w-dst',
    name: 'Dest',
    location: 'B',
  } as unknown as Warehouse;
  const mockItem = {
    id: 'item-1',
    name: 'Laptop',
    warehouseId: 'w-src',
  } as unknown as InventoryItem;

  const futureDate = () =>
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const mockLoan = {
    id: 'loan-1',
    sourceWarehouseId: 'w-src',
    destinationWarehouseId: 'w-dst',
    status: 'PENDING',
    loanDate: new Date(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    returnDate: null,
    createdById: 'user-1',
    notes: null,
    items: [
      {
        id: 'li-1',
        inventoryItemId: 'item-1',
        quantity: 1,
        notes: null,
        inventoryItem: mockItem,
      },
    ],
    sourceWarehouse: mockWarehouse,
    destinationWarehouse: mockDestWarehouse,
    createdBy: { id: 'user-1', email: 'u@test.com', name: 'User' },
  } as unknown as Loan;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    prisma.loanItem.findMany.mockResolvedValue([]);
    prisma.inventoryItem.findMany.mockResolvedValue([mockItem]);
    prisma.$transaction.mockImplementation(((
      cb: (tx: DeepMockProxy<PrismaService>) => unknown,
    ) => cb(prisma)) as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: QrService,
          useValue: {
            generateCode: jest.fn().mockReturnValue('qr-code'),
            generateQrDataUrl: jest.fn().mockResolvedValue('data:url'),
            parseQrData: jest.fn(),
          },
        },
        { provide: EventsService, useValue: { emitLoanChange: jest.fn() } },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
            logSafe: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<LoansService>(LoansService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const baseDto = () => ({
      items: [{ inventoryItemId: 'item-1', quantity: 1 }],
      sourceWarehouseId: 'w-src',
      destinationWarehouseId: 'w-dst',
      dueDate: futureDate(),
    });

    it('creates a multi-item loan', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce(mockWarehouse)
        .mockResolvedValueOnce(mockDestWarehouse);
      prisma.loan.create.mockResolvedValue(mockLoan);

      const result = await service.create(baseDto(), 'user-1');

      expect(result).toEqual(mockLoan);
      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.loan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.objectContaining({
            items: {
              create: [
                expect.objectContaining({
                  inventoryItemId: 'item-1',
                  quantity: 1,
                }),
              ],
            },
          }),
        }),
      );
    });

    it('rejects when source and destination are the same', async () => {
      await expect(
        service.create(
          { ...baseDto(), destinationWarehouseId: 'w-src' },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects empty items', async () => {
      await expect(
        service.create({ ...baseDto(), items: [] }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate items in payload', async () => {
      await expect(
        service.create(
          {
            ...baseDto(),
            items: [
              { inventoryItemId: 'item-1', quantity: 1 },
              { inventoryItemId: 'item-1', quantity: 2 },
            ],
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when item belongs to a different warehouse', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce(mockWarehouse)
        .mockResolvedValueOnce(mockDestWarehouse);
      prisma.inventoryItem.findMany.mockResolvedValueOnce([
        { id: 'item-1', warehouseId: 'other' } as unknown as InventoryItem,
      ]);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when an item is already on active loan', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce(mockWarehouse)
        .mockResolvedValueOnce(mockDestWarehouse);
      prisma.loanItem.findMany.mockResolvedValueOnce([
        { inventoryItemId: 'item-1' } as unknown as LoanItem,
      ]);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when warehouse not found', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);
      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOne', () => {
    it('returns the loan', async () => {
      prisma.loan.findUnique.mockResolvedValue(mockLoan);
      const result = await service.findOne('loan-1');
      expect(result).toEqual(mockLoan);
    });

    it('throws when loan not found', async () => {
      prisma.loan.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('deletes a loan', async () => {
      prisma.loan.delete.mockResolvedValue(mockLoan);
      await service.remove('loan-1');
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.loan.delete).toHaveBeenCalledWith({
        where: { id: 'loan-1' },
      });
    });

    it('throws when loan not found', async () => {
      prisma.loan.delete.mockRejectedValue(prismaError('P2025'));
      await expect(service.remove('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('confirmReceipt', () => {
    const sentLoan = { ...mockLoan, status: 'SENT', sendQrCode: 'qr-abc' };

    it('confirms receipt when QR is valid', async () => {
      prisma.loan.findFirst.mockResolvedValue(sentLoan);
      prisma.loan.findUnique.mockResolvedValue(sentLoan);
      prisma.loan.update.mockResolvedValue({ ...sentLoan, status: 'RECEIVED' });

      const result = await service.confirmReceipt('qr-abc', 'user-2');

      expect(result.status).toBe('RECEIVED');
    });

    it('throws NotFoundException for invalid QR code', async () => {
      prisma.loan.findFirst.mockResolvedValue(null);
      await expect(service.confirmReceipt('bad-qr', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when user has no access to either warehouse', async () => {
      prisma.loan.findFirst.mockResolvedValue(sentLoan);
      await expect(
        service.confirmReceipt('qr-abc', 'user-2', ['some-other-warehouse']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows confirmation when user has access to the source warehouse', async () => {
      prisma.loan.findFirst.mockResolvedValue(sentLoan);
      prisma.loan.findUnique.mockResolvedValue(sentLoan);
      prisma.loan.update.mockResolvedValue({ ...sentLoan, status: 'RECEIVED' });

      const result = await service.confirmReceipt('qr-abc', 'user-2', [
        'w-src',
      ]);
      expect(result.status).toBe('RECEIVED');
    });
  });

  describe('confirmReturn', () => {
    const pendingReturnLoan = {
      ...mockLoan,
      status: 'RETURN_PENDING',
      returnQrCode: 'qr-ret',
    };

    it('confirms return when QR is valid', async () => {
      prisma.loan.findFirst.mockResolvedValue(pendingReturnLoan);
      prisma.loan.findUnique.mockResolvedValue(pendingReturnLoan);
      prisma.loan.update.mockResolvedValue({
        ...pendingReturnLoan,
        status: 'RETURNED',
      });

      const result = await service.confirmReturn('qr-ret', 'user-2');
      expect(result.status).toBe('RETURNED');
    });

    it('throws ForbiddenException when user has no access to either warehouse', async () => {
      prisma.loan.findFirst.mockResolvedValue(pendingReturnLoan);
      await expect(
        service.confirmReturn('qr-ret', 'user-2', ['unrelated-warehouse']),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('isItemOnLoan', () => {
    it('returns true when item is on active loan', async () => {
      prisma.loan.findFirst.mockResolvedValue(mockLoan);
      expect(await service.isItemOnLoan('item-1')).toBe(true);
    });

    it('returns false otherwise', async () => {
      prisma.loan.findFirst.mockResolvedValue(null);
      expect(await service.isItemOnLoan('item-1')).toBe(false);
    });
  });
});
