import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DischargeRequestsService } from './discharge-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QrService } from '../qr/qr.service';
import { DischargeRequestStatus } from '@prisma/client';

describe('DischargeRequestsService', () => {
  let service: DischargeRequestsService;
  let prisma: jest.Mocked<PrismaService>;
  let auditService: jest.Mocked<AuditService>;
  let qrService: jest.Mocked<QrService>;

  const mockWarehouse = { id: 'wh-1', name: 'Main Warehouse' };

  const mockInventoryItem = {
    id: 'item-1',
    name: 'Test Item',
    quantity: 10,
    category: 'Electronics',
    itemType: 'BULK',
    serviceTag: null,
    warehouseId: 'wh-1',
    warehouse: mockWarehouse,
    deletedAt: null,
    description: 'desc',
    minQuantity: 2,
    price: 100,
    currency: 'USD',
    sku: 'SKU-001',
    supplierId: null,
  };

  const mockRequest = {
    id: 'req-1',
    requesterName: 'John Doe',
    requesterPosition: 'Manager',
    requesterPhone: '555-1234',
    justification: 'Needed for project',
    neededByDate: null,
    warehouseId: 'wh-1',
    status: DischargeRequestStatus.PENDING,
    resolvedById: null,
    resolvedAt: null,
    rejectedReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    warehouse: mockWarehouse,
    resolvedBy: null,
    items: [
      {
        id: 'req-item-1',
        dischargeRequestId: 'req-1',
        inventoryItemId: 'item-1',
        quantity: 3,
        inventoryItem: mockInventoryItem,
      },
    ],
  };

  beforeEach(async () => {
    const mockTransaction = jest.fn().mockImplementation(async (fn) => fn({
      dischargeRequest: {
        create: jest.fn().mockResolvedValue(mockRequest),
        update: jest.fn().mockResolvedValue({ ...mockRequest, status: DischargeRequestStatus.COMPLETED }),
      },
      inventoryItem: {
        findFirst: jest.fn().mockResolvedValue(mockInventoryItem),
        update: jest.fn().mockResolvedValue(mockInventoryItem),
      },
    }));

    const mockPrismaService = {
      inventoryItem: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      dischargeRequest: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
      $transaction: mockTransaction,
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const mockQrService = {
      generateUrlQrDataUrl: jest.fn().mockResolvedValue('data:image/png;base64,QR'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DischargeRequestsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: QrService, useValue: mockQrService },
      ],
    }).compile();

    service = module.get<DischargeRequestsService>(DischargeRequestsService);
    prisma = module.get(PrismaService);
    auditService = module.get(AuditService);
    qrService = module.get(QrService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createFromPublicForm', () => {
    const dto = {
      requesterName: 'John Doe',
      requesterPosition: 'Manager',
      requesterPhone: '555-1234',
      justification: 'Needed for project',
      neededByDate: undefined,
      items: [{ inventoryItemId: 'item-1', quantity: 3 }],
    };

    it('creates discharge request and logs audit', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(mockInventoryItem);

      const result = await service.createFromPublicForm(dto);

      expect(result.requestsCreated).toBe(1);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entity: 'DischargeRequest' }),
      );
    });

    it('throws NotFoundException when inventory item not found', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.createFromPublicForm(dto)).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when insufficient quantity', async () => {
      const dtoOverRequest = {
        ...dto,
        items: [{ inventoryItemId: 'item-1', quantity: 999 }],
      };
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(mockInventoryItem);

      await expect(service.createFromPublicForm(dtoOverRequest)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAvailableItems', () => {
    it('returns items with quantity > 0 and not deleted', async () => {
      (prisma.inventoryItem.findMany as jest.Mock).mockResolvedValue([mockInventoryItem]);

      const result = await service.getAvailableItems();

      expect(result).toHaveLength(1);
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { quantity: { gt: 0 }, deletedAt: null },
        }),
      );
    });
  });

  describe('findAll', () => {
    it('returns paginated requests', async () => {
      (prisma.dischargeRequest.findMany as jest.Mock).mockResolvedValue([mockRequest]);
      (prisma.dischargeRequest.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('filters by status when provided', async () => {
      (prisma.dischargeRequest.findMany as jest.Mock).mockResolvedValue([mockRequest]);
      (prisma.dischargeRequest.count as jest.Mock).mockResolvedValue(1);

      await service.findAll({ status: DischargeRequestStatus.PENDING });

      expect(prisma.dischargeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: DischargeRequestStatus.PENDING }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns request by id', async () => {
      (prisma.dischargeRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);

      const result = await service.findOne('req-1');

      expect(result).toEqual(mockRequest);
    });

    it('throws NotFoundException when not found', async () => {
      (prisma.dischargeRequest.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('not-found')).rejects.toThrow(NotFoundException);
    });
  });

  describe('complete', () => {
    it('completes a pending request and decrements inventory', async () => {
      (prisma.dischargeRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);

      const result = await service.complete('req-1', 'user-1');

      expect(result.status).toBe(DischargeRequestStatus.COMPLETED);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE', entity: 'DischargeRequest' }),
      );
    });

    it('throws BadRequestException when request is not PENDING', async () => {
      const completedRequest = { ...mockRequest, status: DischargeRequestStatus.COMPLETED };
      (prisma.dischargeRequest.findUnique as jest.Mock).mockResolvedValue(completedRequest);

      await expect(service.complete('req-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when request not found', async () => {
      (prisma.dischargeRequest.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.complete('not-found', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('reject', () => {
    it('rejects a pending request with reason', async () => {
      const rejectedRequest = { ...mockRequest, status: DischargeRequestStatus.REJECTED, rejectedReason: 'No budget' };
      (prisma.dischargeRequest.findUnique as jest.Mock).mockResolvedValue(mockRequest);
      (prisma.dischargeRequest.update as jest.Mock).mockResolvedValue(rejectedRequest);

      const result = await service.reject('req-1', 'user-1', 'No budget');

      expect(result.status).toBe(DischargeRequestStatus.REJECTED);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ changes: expect.objectContaining({ status: 'REJECTED', reason: 'No budget' }) }),
      );
    });

    it('throws BadRequestException when request is not PENDING', async () => {
      const rejectedRequest = { ...mockRequest, status: DischargeRequestStatus.REJECTED };
      (prisma.dischargeRequest.findUnique as jest.Mock).mockResolvedValue(rejectedRequest);

      await expect(service.reject('req-1', 'user-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('getStats', () => {
    it('returns counts by status', async () => {
      (prisma.dischargeRequest.count as jest.Mock)
        .mockResolvedValueOnce(10)  // total
        .mockResolvedValueOnce(4)   // pending
        .mockResolvedValueOnce(5)   // completed
        .mockResolvedValueOnce(1);  // rejected

      const result = await service.getStats();

      expect(result.total).toBe(10);
      expect(result.byStatus.pending).toBe(4);
      expect(result.byStatus.completed).toBe(5);
      expect(result.byStatus.rejected).toBe(1);
    });
  });

  describe('getRequestFormQr', () => {
    it('returns QR code data url for the request form', async () => {
      const result = await service.getRequestFormQr();

      expect(result.qrDataUrl).toBe('data:image/png;base64,QR');
      expect(result.url).toContain('/request');
      expect(qrService.generateUrlQrDataUrl).toHaveBeenCalled();
    });
  });
});
