import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { TransferRequestsService } from './transfer-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QrService } from '../qr/qr.service';
import {
  RequestStatus,
  type TransferRequest,
  type Warehouse,
  type InventoryItem,
} from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';

describe('TransferRequestsService', () => {
  let service: TransferRequestsService;
  let prisma: DeepMockProxy<PrismaService>;
  let auditService: { log: jest.Mock; logSafe: jest.Mock };
  let qrService: {
    generateCode: jest.Mock;
    generateQrDataUrl: jest.Mock;
    parseQrData: jest.Mock;
  };

  const mockSourceWarehouse = {
    id: 'wh-src',
    name: 'Source Warehouse',
    isActive: true,
  } as unknown as Warehouse;
  const mockDestWarehouse = {
    id: 'wh-dst',
    name: 'Destination Warehouse',
    isActive: true,
  } as unknown as Warehouse;

  const mockInventoryItem = {
    id: 'item-1',
    name: 'Test Item',
    quantity: 20,
    category: 'Electronics',
    itemType: 'BULK',
    warehouseId: 'wh-src',
    deletedAt: null,
    description: 'desc',
    minQuantity: 2,
    price: 100,
    currency: 'USD',
    sku: 'SKU-001',
    supplierId: null,
    serviceTag: null,
    warehouse: mockSourceWarehouse,
  } as unknown as InventoryItem;

  // Fixtures deliberately only populate the fields each test actually reads;
  // cast once here (rather than at each mockResolvedValue call site) now that
  // `prisma` is a fully-typed DeepMockProxy<PrismaService>.
  const mockTransferRequest = {
    id: 'tr-1',
    sourceWarehouseId: 'wh-src',
    destinationWarehouseId: 'wh-dst',
    requestedById: 'user-1',
    approvedById: null,
    status: RequestStatus.PENDING,
    notes: null,
    sendQrCode: null,
    approvedAt: null,
    rejectedAt: null,
    rejectedReason: null,
    receivedAt: null,
    receivedById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    sourceWarehouse: mockSourceWarehouse,
    destinationWarehouse: mockDestWarehouse,
    requestedBy: { id: 'user-1', name: 'User', email: 'user@test.com' },
    approvedBy: null,
    receivedBy: null,
    items: [
      {
        id: 'tr-item-1',
        transferRequestId: 'tr-1',
        inventoryItemId: 'item-1',
        quantity: 5,
        inventoryItem: mockInventoryItem,
      },
    ],
  } as unknown as TransferRequest;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    // inventoryItem tx mock — standalone, used for confirmReceipt / complete flows
    prisma.inventoryItem.update.mockResolvedValue(mockInventoryItem);
    prisma.inventoryItem.findUnique.mockResolvedValue(mockInventoryItem);
    prisma.inventoryItem.findFirst.mockResolvedValue(null);
    prisma.inventoryItem.create.mockResolvedValue({
      ...mockInventoryItem,
      warehouseId: 'wh-dst',
    } as unknown as InventoryItem);

    // Default $transaction delegates to the outer mock so per-test setup on
    // prisma.transferRequest/inventoryItem flows into the transaction.
    prisma.$transaction.mockImplementation(((
      cb: (tx: DeepMockProxy<PrismaService>) => unknown,
    ) => cb(prisma)) as never);

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
      logSafe: jest.fn(),
    };

    const mockQrService = {
      generateCode: jest.fn().mockReturnValue('QR-CODE-123'),
      generateQrDataUrl: jest
        .fn()
        .mockResolvedValue('data:image/png;base64,QR'),
      parseQrData: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransferRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: QrService, useValue: mockQrService },
      ],
    }).compile();

    service = module.get<TransferRequestsService>(TransferRequestsService);
    auditService = module.get(AuditService);
    qrService = module.get(QrService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const dto = {
      sourceWarehouseId: 'wh-src',
      destinationWarehouseId: 'wh-dst',
      notes: null,
      items: [{ inventoryItemId: 'item-1', quantity: 5 }],
    };

    it('creates a transfer request and logs audit', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce(mockSourceWarehouse)
        .mockResolvedValueOnce(mockDestWarehouse);
      prisma.inventoryItem.findMany.mockResolvedValue([mockInventoryItem]);
      prisma.transferRequest.create.mockResolvedValue(mockTransferRequest);

      const result = await service.create(dto, 'user-1');

      expect(result).toEqual(mockTransferRequest);
      expect(auditService.logSafe).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'TransferRequest',
        }),
      );
    });

    it('throws BadRequestException when source and destination are the same', async () => {
      const sameDtoWh = { ...dto, destinationWarehouseId: 'wh-src' };

      await expect(service.create(sameDtoWh, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when source warehouse not found', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when destination warehouse not found', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce(mockSourceWarehouse)
        .mockResolvedValueOnce(null);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when source warehouse is inactive', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce({
          ...mockSourceWarehouse,
          isActive: false,
        } as unknown as Warehouse)
        .mockResolvedValueOnce(mockDestWarehouse);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when inventory item not found', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce(mockSourceWarehouse)
        .mockResolvedValueOnce(mockDestWarehouse);
      // findMany returns empty array — item not found in batch results
      prisma.inventoryItem.findMany.mockResolvedValue([]);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when item does not belong to source warehouse', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce(mockSourceWarehouse)
        .mockResolvedValueOnce(mockDestWarehouse);
      prisma.inventoryItem.findMany.mockResolvedValue([
        {
          ...mockInventoryItem,
          warehouseId: 'other-wh',
        } as unknown as InventoryItem,
      ]);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when insufficient quantity', async () => {
      prisma.warehouse.findUnique
        .mockResolvedValueOnce(mockSourceWarehouse)
        .mockResolvedValueOnce(mockDestWarehouse);
      prisma.inventoryItem.findMany.mockResolvedValue([
        {
          ...mockInventoryItem,
          quantity: 2,
        } as unknown as InventoryItem,
      ]);

      const dtoOverRequest = {
        ...dto,
        items: [{ inventoryItemId: 'item-1', quantity: 10 }],
      };

      await expect(service.create(dtoOverRequest, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('returns paginated transfer requests', async () => {
      prisma.transferRequest.findMany.mockResolvedValue([mockTransferRequest]);
      prisma.transferRequest.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('filters by status when provided', async () => {
      prisma.transferRequest.findMany.mockResolvedValue([mockTransferRequest]);
      prisma.transferRequest.count.mockResolvedValue(1);

      await service.findAll({}, RequestStatus.PENDING);

      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.transferRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({ status: RequestStatus.PENDING }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns transfer request by id', async () => {
      prisma.transferRequest.findUnique.mockResolvedValue(mockTransferRequest);

      const result = await service.findOne('tr-1');

      expect(result).toEqual(mockTransferRequest);
    });

    it('throws NotFoundException when not found', async () => {
      prisma.transferRequest.findUnique.mockResolvedValue(null);

      await expect(service.findOne('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('approve', () => {
    it('approves a pending transfer request', async () => {
      const approvedRequest = {
        ...mockTransferRequest,
        status: RequestStatus.APPROVED,
        approvedById: 'user-2',
      } as unknown as TransferRequest;
      // Both findOne (pre-tx) and tx.transferRequest.findUnique (TOCTOU re-check) use the same mock.
      // tx.transferRequest.update (via delegating global mock) returns approvedRequest.
      prisma.transferRequest.findUnique.mockResolvedValue(mockTransferRequest);
      prisma.transferRequest.update.mockResolvedValue(approvedRequest);

      const result = await service.approve('tr-1', 'user-2');

      expect(result.status).toBe(RequestStatus.APPROVED);
      expect(auditService.logSafe).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          changes: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            after: expect.objectContaining({ status: 'APPROVED' }),
          }),
        }),
      );
    });

    it('throws BadRequestException when request is not PENDING', async () => {
      const alreadyApproved = {
        ...mockTransferRequest,
        status: RequestStatus.APPROVED,
      } as unknown as TransferRequest;
      // Both findOne and tx TOCTOU re-check see non-PENDING — throws before update.
      prisma.transferRequest.findUnique.mockResolvedValue(alreadyApproved);

      await expect(service.approve('tr-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('sendTransfer', () => {
    it('generates QR code and sets status to SENT', async () => {
      const approvedRequest = {
        ...mockTransferRequest,
        status: RequestStatus.APPROVED,
      } as unknown as TransferRequest;
      const sentRequest = {
        ...approvedRequest,
        status: RequestStatus.SENT,
        sendQrCode: 'QR-CODE-123',
      } as unknown as TransferRequest;
      prisma.transferRequest.findUnique.mockResolvedValue(approvedRequest);
      prisma.transferRequest.update.mockResolvedValue(sentRequest);

      const result = await service.sendTransfer('tr-1', 'user-1');

      expect(result.status).toBe(RequestStatus.SENT);
      expect(result.qrCodeDataUrl).toBe('data:image/png;base64,QR');
      expect(qrService.generateCode).toHaveBeenCalled();
    });

    it('throws BadRequestException when request is not APPROVED', async () => {
      prisma.transferRequest.findUnique.mockResolvedValue(mockTransferRequest);

      await expect(service.sendTransfer('tr-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('confirmReceipt', () => {
    it('completes transfer when valid QR code is scanned', async () => {
      const sentRequest = {
        ...mockTransferRequest,
        status: RequestStatus.SENT,
        sendQrCode: 'QR-CODE-123',
      } as unknown as TransferRequest;
      const completedRequest = {
        ...sentRequest,
        status: RequestStatus.COMPLETED,
      } as unknown as TransferRequest;
      // findFirst: initial lookup by QR code; findUnique: TOCTOU re-check inside tx
      prisma.transferRequest.findFirst.mockResolvedValue(sentRequest);
      prisma.transferRequest.findUnique.mockResolvedValue(sentRequest);
      prisma.transferRequest.update.mockResolvedValue(completedRequest);

      const result = await service.confirmReceipt('QR-CODE-123', 'user-2');

      expect(result.status).toBe(RequestStatus.COMPLETED);
      expect(auditService.logSafe).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          changes: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            after: expect.objectContaining({ confirmedViaQr: true }),
          }),
        }),
      );
    });

    it('throws NotFoundException when QR code is invalid', async () => {
      prisma.transferRequest.findFirst.mockResolvedValue(null);

      await expect(service.confirmReceipt('INVALID', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when transfer is not in SENT status', async () => {
      const approvedRequest = {
        ...mockTransferRequest,
        status: RequestStatus.APPROVED,
        sendQrCode: 'QR-CODE-123',
      } as unknown as TransferRequest;
      // findFirst: initial lookup; findUnique: TOCTOU re-check sees non-SENT status → throws
      prisma.transferRequest.findFirst.mockResolvedValue(approvedRequest);
      prisma.transferRequest.findUnique.mockResolvedValue(approvedRequest);

      await expect(
        service.confirmReceipt('QR-CODE-123', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when user has no access to either warehouse', async () => {
      const sentRequest = {
        ...mockTransferRequest,
        status: RequestStatus.SENT,
        sendQrCode: 'QR-CODE-123',
      } as unknown as TransferRequest;
      prisma.transferRequest.findFirst.mockResolvedValue(sentRequest);

      await expect(
        service.confirmReceipt('QR-CODE-123', 'user-2', [
          'some-other-warehouse',
        ]),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows confirmation when user has access to the destination warehouse', async () => {
      const sentRequest = {
        ...mockTransferRequest,
        status: RequestStatus.SENT,
        sendQrCode: 'QR-CODE-123',
      } as unknown as TransferRequest;
      const completedRequest = {
        ...sentRequest,
        status: RequestStatus.COMPLETED,
      } as unknown as TransferRequest;
      prisma.transferRequest.findFirst.mockResolvedValue(sentRequest);
      prisma.transferRequest.findUnique.mockResolvedValue(sentRequest);
      prisma.transferRequest.update.mockResolvedValue(completedRequest);

      const result = await service.confirmReceipt('QR-CODE-123', 'user-2', [
        'wh-dst',
      ]);

      expect(result.status).toBe(RequestStatus.COMPLETED);
    });
  });

  describe('reject', () => {
    it('rejects a pending request with reason', async () => {
      const rejectedRequest = {
        ...mockTransferRequest,
        status: RequestStatus.REJECTED,
        rejectedReason: 'No capacity',
      } as unknown as TransferRequest;
      prisma.transferRequest.findUnique.mockResolvedValue(mockTransferRequest);
      prisma.transferRequest.update.mockResolvedValue(rejectedRequest);

      const result = await service.reject('tr-1', 'user-2', 'No capacity');

      expect(result.status).toBe(RequestStatus.REJECTED);
      expect(auditService.logSafe).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          changes: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            after: expect.objectContaining({
              status: 'REJECTED',
              reason: 'No capacity',
            }),
          }),
        }),
      );
    });

    it('throws BadRequestException when request is not PENDING', async () => {
      const approvedRequest = {
        ...mockTransferRequest,
        status: RequestStatus.APPROVED,
      } as unknown as TransferRequest;
      prisma.transferRequest.findUnique.mockResolvedValue(approvedRequest);

      await expect(service.reject('tr-1', 'user-2')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('cancel', () => {
    it('cancels a non-completed request', async () => {
      const cancelledRequest = {
        ...mockTransferRequest,
        status: RequestStatus.CANCELLED,
      } as unknown as TransferRequest;
      prisma.transferRequest.findUnique.mockResolvedValue(mockTransferRequest);
      prisma.transferRequest.update.mockResolvedValue(cancelledRequest);

      const result = await service.cancel('tr-1', 'user-1');

      expect(result.status).toBe(RequestStatus.CANCELLED);
    });

    it('throws BadRequestException when request is already COMPLETED', async () => {
      const completedRequest = {
        ...mockTransferRequest,
        status: RequestStatus.COMPLETED,
      } as unknown as TransferRequest;
      prisma.transferRequest.findUnique.mockResolvedValue(completedRequest);

      await expect(service.cancel('tr-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getStats', () => {
    it('returns counts by status', async () => {
      prisma.transferRequest.count
        .mockResolvedValueOnce(20) // total
        .mockResolvedValueOnce(5) // pending
        .mockResolvedValueOnce(3) // approved
        .mockResolvedValueOnce(2) // sent
        .mockResolvedValueOnce(8) // completed
        .mockResolvedValueOnce(1) // rejected
        .mockResolvedValueOnce(1); // cancelled

      const result = await service.getStats();

      expect(result.total).toBe(20);
      expect(result.byStatus.pending).toBe(5);
      expect(result.byStatus.approved).toBe(3);
      expect(result.byStatus.sent).toBe(2);
      expect(result.byStatus.completed).toBe(8);
      expect(result.byStatus.rejected).toBe(1);
      expect(result.byStatus.cancelled).toBe(1);
    });
  });

  describe('processQrCode', () => {
    it('confirms receipt when QR code type is TRANSFER', async () => {
      const sentRequest = {
        ...mockTransferRequest,
        status: RequestStatus.SENT,
        sendQrCode: 'QR-CODE-123',
      } as unknown as TransferRequest;
      const completedRequest = {
        ...sentRequest,
        status: RequestStatus.COMPLETED,
      } as unknown as TransferRequest;
      qrService.parseQrData.mockReturnValue({
        type: 'TRANSFER',
        id: 'tr-1',
        code: 'QR-CODE-123',
      });
      // findFirst: lookup by QR code; findUnique: TOCTOU re-check inside tx
      prisma.transferRequest.findFirst.mockResolvedValue(sentRequest);
      prisma.transferRequest.findUnique.mockResolvedValue(sentRequest);
      prisma.transferRequest.update.mockResolvedValue(completedRequest);

      const result = await service.processQrCode(
        '{"type":"TRANSFER","id":"tr-1","code":"QR-CODE-123"}',
        'user-2',
      );

      expect(result.status).toBe(RequestStatus.COMPLETED);
    });

    it('throws BadRequestException when QR data is invalid', async () => {
      qrService.parseQrData.mockReturnValue(null);

      await expect(
        service.processQrCode('INVALID_JSON', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when QR type is not TRANSFER', async () => {
      qrService.parseQrData.mockReturnValue({
        type: 'LOAN',
        id: 'loan-1',
        code: 'some-code',
      });

      await expect(
        service.processQrCode('{"type":"LOAN"}', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
