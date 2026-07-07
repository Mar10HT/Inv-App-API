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
import { RequestStatus } from '@prisma/client';

describe('TransferRequestsService', () => {
  let service: TransferRequestsService;
  let prisma: jest.Mocked<PrismaService>;
  let auditService: jest.Mocked<AuditService>;
  let qrService: jest.Mocked<QrService>;

  const mockSourceWarehouse = {
    id: 'wh-src',
    name: 'Source Warehouse',
    isActive: true,
  };
  const mockDestWarehouse = {
    id: 'wh-dst',
    name: 'Destination Warehouse',
    isActive: true,
  };

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
  };

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
  };

  beforeEach(async () => {
    // inventoryItem tx mock — standalone, used for confirmReceipt / complete flows
    const mockTxInventoryItem = {
      update: jest.fn().mockResolvedValue(mockInventoryItem),
      findUnique: jest.fn().mockResolvedValue(mockInventoryItem),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest
        .fn()
        .mockResolvedValue({ ...mockInventoryItem, warehouseId: 'wh-dst' }),
    };

    const mockPrismaService = {
      warehouse: { findUnique: jest.fn() },
      inventoryItem: { findUnique: jest.fn(), findMany: jest.fn() },
      transferRequest: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      // Default $transaction delegates transferRequest ops to the outer mock so per-test
      // setup on prisma.transferRequest.findUnique/update flows into the transaction.
      $transaction: jest.fn().mockImplementation(async (fn) =>
        fn({
          inventoryItem: mockTxInventoryItem,
          transferRequest: {
            findUnique: (...args: any[]) =>
              mockPrismaService.transferRequest.findUnique(...args),

            update: (...args: any[]) =>
              mockPrismaService.transferRequest.update(...args),
          },
        }),
      ),
    };

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
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: QrService, useValue: mockQrService },
      ],
    }).compile();

    service = module.get<TransferRequestsService>(TransferRequestsService);
    prisma = module.get(PrismaService);
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
      (prisma.warehouse.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockSourceWarehouse)
        .mockResolvedValueOnce(mockDestWarehouse);
      (prisma.inventoryItem.findMany as jest.Mock).mockResolvedValue([
        mockInventoryItem,
      ]);
      (prisma.transferRequest.create as jest.Mock).mockResolvedValue(
        mockTransferRequest,
      );

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
      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when destination warehouse not found', async () => {
      (prisma.warehouse.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockSourceWarehouse)
        .mockResolvedValueOnce(null);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when source warehouse is inactive', async () => {
      (prisma.warehouse.findUnique as jest.Mock)
        .mockResolvedValueOnce({ ...mockSourceWarehouse, isActive: false })
        .mockResolvedValueOnce(mockDestWarehouse);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when inventory item not found', async () => {
      (prisma.warehouse.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockSourceWarehouse)
        .mockResolvedValueOnce(mockDestWarehouse);
      // findMany returns empty array — item not found in batch results
      (prisma.inventoryItem.findMany as jest.Mock).mockResolvedValue([]);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when item does not belong to source warehouse', async () => {
      (prisma.warehouse.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockSourceWarehouse)
        .mockResolvedValueOnce(mockDestWarehouse);
      (prisma.inventoryItem.findMany as jest.Mock).mockResolvedValue([
        {
          ...mockInventoryItem,
          warehouseId: 'other-wh',
        },
      ]);

      await expect(service.create(dto, 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when insufficient quantity', async () => {
      (prisma.warehouse.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockSourceWarehouse)
        .mockResolvedValueOnce(mockDestWarehouse);
      (prisma.inventoryItem.findMany as jest.Mock).mockResolvedValue([
        {
          ...mockInventoryItem,
          quantity: 2,
        },
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
      (prisma.transferRequest.findMany as jest.Mock).mockResolvedValue([
        mockTransferRequest,
      ]);
      (prisma.transferRequest.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll();

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('filters by status when provided', async () => {
      (prisma.transferRequest.findMany as jest.Mock).mockResolvedValue([
        mockTransferRequest,
      ]);
      (prisma.transferRequest.count as jest.Mock).mockResolvedValue(1);

      await service.findAll({}, RequestStatus.PENDING);

      expect(prisma.transferRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: RequestStatus.PENDING }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns transfer request by id', async () => {
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        mockTransferRequest,
      );

      const result = await service.findOne('tr-1');

      expect(result).toEqual(mockTransferRequest);
    });

    it('throws NotFoundException when not found', async () => {
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(null);

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
      };
      // Both findOne (pre-tx) and tx.transferRequest.findUnique (TOCTOU re-check) use the same mock.
      // tx.transferRequest.update (via delegating global mock) returns approvedRequest.
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        mockTransferRequest,
      );
      (prisma.transferRequest.update as jest.Mock).mockResolvedValue(
        approvedRequest,
      );

      const result = await service.approve('tr-1', 'user-2');

      expect(result.status).toBe(RequestStatus.APPROVED);
      expect(auditService.logSafe).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: expect.objectContaining({
            after: expect.objectContaining({ status: 'APPROVED' }),
          }),
        }),
      );
    });

    it('throws BadRequestException when request is not PENDING', async () => {
      const alreadyApproved = {
        ...mockTransferRequest,
        status: RequestStatus.APPROVED,
      };
      // Both findOne and tx TOCTOU re-check see non-PENDING — throws before update.
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        alreadyApproved,
      );

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
      };
      const sentRequest = {
        ...approvedRequest,
        status: RequestStatus.SENT,
        sendQrCode: 'QR-CODE-123',
      };
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        approvedRequest,
      );
      (prisma.transferRequest.update as jest.Mock).mockResolvedValue(
        sentRequest,
      );

      const result = await service.sendTransfer('tr-1', 'user-1');

      expect(result.status).toBe(RequestStatus.SENT);
      expect(result.qrCodeDataUrl).toBe('data:image/png;base64,QR');
      expect(qrService.generateCode).toHaveBeenCalled();
    });

    it('throws BadRequestException when request is not APPROVED', async () => {
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        mockTransferRequest,
      );

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
      };
      const completedRequest = {
        ...sentRequest,
        status: RequestStatus.COMPLETED,
      };
      // findFirst: initial lookup by QR code; findUnique: TOCTOU re-check inside tx
      (prisma.transferRequest.findFirst as jest.Mock).mockResolvedValue(
        sentRequest,
      );
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        sentRequest,
      );
      (prisma.transferRequest.update as jest.Mock).mockResolvedValue(
        completedRequest,
      );

      const result = await service.confirmReceipt('QR-CODE-123', 'user-2');

      expect(result.status).toBe(RequestStatus.COMPLETED);
      expect(auditService.logSafe).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: expect.objectContaining({
            after: expect.objectContaining({ confirmedViaQr: true }),
          }),
        }),
      );
    });

    it('throws NotFoundException when QR code is invalid', async () => {
      (prisma.transferRequest.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.confirmReceipt('INVALID', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when transfer is not in SENT status', async () => {
      const approvedRequest = {
        ...mockTransferRequest,
        status: RequestStatus.APPROVED,
        sendQrCode: 'QR-CODE-123',
      };
      // findFirst: initial lookup; findUnique: TOCTOU re-check sees non-SENT status → throws
      (prisma.transferRequest.findFirst as jest.Mock).mockResolvedValue(
        approvedRequest,
      );
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        approvedRequest,
      );

      await expect(
        service.confirmReceipt('QR-CODE-123', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when user has no access to either warehouse', async () => {
      const sentRequest = {
        ...mockTransferRequest,
        status: RequestStatus.SENT,
        sendQrCode: 'QR-CODE-123',
      };
      (prisma.transferRequest.findFirst as jest.Mock).mockResolvedValue(
        sentRequest,
      );

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
      };
      const completedRequest = {
        ...sentRequest,
        status: RequestStatus.COMPLETED,
      };
      (prisma.transferRequest.findFirst as jest.Mock).mockResolvedValue(
        sentRequest,
      );
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        sentRequest,
      );
      (prisma.transferRequest.update as jest.Mock).mockResolvedValue(
        completedRequest,
      );

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
      };
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        mockTransferRequest,
      );
      (prisma.transferRequest.update as jest.Mock).mockResolvedValue(
        rejectedRequest,
      );

      const result = await service.reject('tr-1', 'user-2', 'No capacity');

      expect(result.status).toBe(RequestStatus.REJECTED);
      expect(auditService.logSafe).toHaveBeenCalledWith(
        expect.objectContaining({
          changes: expect.objectContaining({
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
      };
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        approvedRequest,
      );

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
      };
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        mockTransferRequest,
      );
      (prisma.transferRequest.update as jest.Mock).mockResolvedValue(
        cancelledRequest,
      );

      const result = await service.cancel('tr-1', 'user-1');

      expect(result.status).toBe(RequestStatus.CANCELLED);
    });

    it('throws BadRequestException when request is already COMPLETED', async () => {
      const completedRequest = {
        ...mockTransferRequest,
        status: RequestStatus.COMPLETED,
      };
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        completedRequest,
      );

      await expect(service.cancel('tr-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getStats', () => {
    it('returns counts by status', async () => {
      (prisma.transferRequest.count as jest.Mock)
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
      };
      const completedRequest = {
        ...sentRequest,
        status: RequestStatus.COMPLETED,
      };
      (qrService.parseQrData as jest.Mock).mockReturnValue({
        type: 'TRANSFER',
        id: 'tr-1',
        code: 'QR-CODE-123',
      });
      // findFirst: lookup by QR code; findUnique: TOCTOU re-check inside tx
      (prisma.transferRequest.findFirst as jest.Mock).mockResolvedValue(
        sentRequest,
      );
      (prisma.transferRequest.findUnique as jest.Mock).mockResolvedValue(
        sentRequest,
      );
      (prisma.transferRequest.update as jest.Mock).mockResolvedValue(
        completedRequest,
      );

      const result = await service.processQrCode(
        '{"type":"TRANSFER","id":"tr-1","code":"QR-CODE-123"}',
        'user-2',
      );

      expect(result.status).toBe(RequestStatus.COMPLETED);
    });

    it('throws BadRequestException when QR data is invalid', async () => {
      (qrService.parseQrData as jest.Mock).mockReturnValue(null);

      await expect(
        service.processQrCode('INVALID_JSON', 'user-2'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when QR type is not TRANSFER', async () => {
      (qrService.parseQrData as jest.Mock).mockReturnValue({
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
