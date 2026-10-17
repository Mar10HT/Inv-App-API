import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
  PurchaseInvoiceStatus,
  type Payment,
} from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prisma: DeepMockProxy<PrismaService>;

  const mockPayment = {
    id: 'pay-1',
    saleId: 'sale-1',
    purchaseInvoiceId: null,
    amount: 50,
    method: PaymentMethod.CASH,
    reference: null,
    notes: null,
    status: PaymentStatus.ACTIVE,
    createdById: 'user-1',
    cancelledById: null,
    cancelledAt: null,
    cancellationReason: null,
  } as unknown as Payment;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    prisma.$transaction.mockImplementation(((
      cb: (tx: DeepMockProxy<PrismaService>) => unknown,
    ) => cb(prisma)) as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AuditService,
          useValue: { log: jest.fn(), logSafe: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    const baseDto = () => ({
      saleId: 'sale-1',
      amount: 50,
      method: PaymentMethod.CASH,
    });

    it('rejects when neither saleId nor purchaseInvoiceId is set', async () => {
      await expect(
        service.create({ amount: 10, method: PaymentMethod.CASH }, 'user-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when both saleId and purchaseInvoiceId are set', async () => {
      await expect(
        service.create(
          {
            saleId: 'sale-1',
            purchaseInvoiceId: 'inv-1',
            amount: 10,
            method: PaymentMethod.CASH,
          },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates a payment against a Sale when the amount is within the balance', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        warehouseId: 'wh-1',
      } as never);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'sale-1',
          status: SaleStatus.ACTIVE,
          totalAmount: 100,
          taxAmount: 15,
        },
      ] as never);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 40 },
      } as never);
      prisma.payment.create.mockResolvedValue(mockPayment);

      const result = await service.create(baseDto(), 'user-1');

      expect(result).toEqual(mockPayment);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            saleId: 'sale-1',
            purchaseInvoiceId: null,
            amount: 50,
            method: PaymentMethod.CASH,
            createdById: 'user-1',
          }) as unknown,
        }),
      );
    });

    it('locks the document row before computing the balance (order matters for the concurrency guarantee)', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        warehouseId: 'wh-1',
      } as never);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'sale-1',
          status: SaleStatus.ACTIVE,
          totalAmount: 100,
          taxAmount: 0,
        },
      ] as never);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      prisma.payment.create.mockResolvedValue(mockPayment);

      await service.create(baseDto(), 'user-1');

      const lockOrder = prisma.$queryRaw.mock.invocationCallOrder[0];

      const aggregateOrder =
        prisma.payment.aggregate.mock.invocationCallOrder[0];

      const createOrder = prisma.payment.create.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(aggregateOrder);
      expect(aggregateOrder).toBeLessThan(createOrder);
    });

    it('blocks overpayment: amount greater than the current balance, without creating the payment', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        warehouseId: 'wh-1',
      } as never);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'sale-1',
          status: SaleStatus.ACTIVE,
          totalAmount: 100,
          taxAmount: 0,
        },
      ] as never);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 90 },
      } as never);

      // Balance is 10, requesting 50
      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('rejects when the target Sale is not ACTIVE', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        warehouseId: 'wh-1',
      } as never);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'sale-1',
          status: SaleStatus.DRAFT,
          totalAmount: 100,
          taxAmount: 0,
        },
      ] as never);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        BadRequestException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.payment.create).not.toHaveBeenCalled();
    });

    it('creates a payment against a PurchaseInvoice', async () => {
      prisma.purchaseInvoice.findUnique.mockResolvedValue({
        id: 'inv-1',
        warehouseId: 'wh-1',
      } as never);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'inv-1',
          status: PurchaseInvoiceStatus.ACTIVE,
          totalAmount: 200,
          taxAmount: 0,
        },
      ] as never);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      prisma.payment.create.mockResolvedValue({
        ...mockPayment,
        saleId: null,
        purchaseInvoiceId: 'inv-1',
      } as never);

      const result = await service.create(
        {
          purchaseInvoiceId: 'inv-1',
          amount: 100,
          method: PaymentMethod.BANK_TRANSFER,
        },
        'user-1',
      );

      expect(result.purchaseInvoiceId).toBe('inv-1');
    });

    it('throws NotFoundException when the Sale does not exist', async () => {
      prisma.sale.findUnique.mockResolvedValue(null);

      await expect(service.create(baseDto(), 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the document is outside the user warehouse scope', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        warehouseId: 'other-wh',
      } as never);

      await expect(
        service.create(baseDto(), 'user-1', ['wh-1']),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('cancel', () => {
    it('flips status to CANCELLED and records who/when/why, without touching the sale or stock', async () => {
      prisma.payment.findUnique
        .mockResolvedValueOnce(mockPayment)
        .mockResolvedValueOnce(mockPayment);
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        warehouseId: 'wh-1',
      } as never);
      prisma.payment.update.mockResolvedValue({
        ...mockPayment,
        status: PaymentStatus.CANCELLED,
      } as never);

      const result = await service.cancel('pay-1', 'user-2', 'Entered twice');

      expect(result.status).toBe(PaymentStatus.CANCELLED);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-1' },
          data: expect.objectContaining({
            status: PaymentStatus.CANCELLED,
            cancelledById: 'user-2',
            cancellationReason: 'Entered twice',
          }) as unknown,
        }),
      );
    });

    it('throws BadRequestException when the payment is already CANCELLED', async () => {
      const cancelled = { ...mockPayment, status: PaymentStatus.CANCELLED };
      prisma.payment.findUnique
        .mockResolvedValueOnce(cancelled as never)
        .mockResolvedValueOnce(cancelled as never);
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        warehouseId: 'wh-1',
      } as never);

      await expect(service.cancel('pay-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('the balance aggregate behind a fresh computation only counts ACTIVE payments, so a cancelled one needs no separate restore step', async () => {
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        warehouseId: 'wh-1',
      } as never);
      prisma.$queryRaw.mockResolvedValueOnce([
        {
          id: 'sale-1',
          status: SaleStatus.ACTIVE,
          totalAmount: 100,
          taxAmount: 0,
        },
      ] as never);
      prisma.payment.aggregate.mockResolvedValue({
        _sum: { amount: 0 },
      } as never);
      prisma.payment.create.mockResolvedValue(mockPayment);

      await service.create(
        { saleId: 'sale-1', amount: 10, method: PaymentMethod.CASH },
        'user-1',
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.payment.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: PaymentStatus.ACTIVE,
          }) as unknown,
        }),
      );
    });
  });

  describe('findOne', () => {
    it('throws ForbiddenException when the linked sale is outside the user warehouse scope', async () => {
      prisma.payment.findUnique.mockResolvedValue(mockPayment);
      prisma.sale.findUnique.mockResolvedValue({
        id: 'sale-1',
        warehouseId: 'other-wh',
      } as never);

      await expect(service.findOne('pay-1', ['wh-1'])).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when missing', async () => {
      prisma.payment.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
