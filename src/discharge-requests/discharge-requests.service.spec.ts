import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DischargeRequestsService } from './discharge-requests.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QrService } from '../qr/qr.service';
import {
  DischargeRequestStatus,
  type DischargeRequest,
  type InventoryItem,
  type Warehouse,
  type Outflow,
} from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';

describe('DischargeRequestsService', () => {
  let service: DischargeRequestsService;
  let prisma: DeepMockProxy<PrismaService>;
  let auditService: jest.Mocked<AuditService>;
  let qrService: jest.Mocked<QrService>;

  const mockWarehouse = {
    id: 'wh-1',
    name: 'Main Warehouse',
  } as unknown as Warehouse;

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
  } as unknown as InventoryItem;

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
  } as unknown as DischargeRequest;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
    // at runtime, but their static type doesn't carry that through cleanly
    // enough for this rule to recognize them as safe to reference unbound.
    prisma.$transaction.mockImplementation(((
      cb: (tx: DeepMockProxy<PrismaService>) => unknown,
    ) => cb(prisma)) as never);

    // Seed defaults used by the transactional flows (createFromPublicForm,
    // complete). Since `tx` above resolves to this same `prisma` mock, these
    // apply equally whether the service calls `this.prisma.x` or `tx.x`.
    prisma.dischargeRequest.create.mockResolvedValue(mockRequest);
    prisma.dischargeRequest.update.mockResolvedValue({
      ...mockRequest,
      status: DischargeRequestStatus.COMPLETED,
    } as unknown as DischargeRequest);
    prisma.inventoryItem.findFirst.mockResolvedValue(mockInventoryItem);
    prisma.inventoryItem.update.mockResolvedValue(mockInventoryItem);
    prisma.outflow.create.mockResolvedValue({
      id: 'outflow-1',
    } as unknown as Outflow);

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const mockQrService = {
      generateUrlQrDataUrl: jest
        .fn()
        .mockResolvedValue('data:image/png;base64,QR'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DischargeRequestsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: mockAuditService },
        { provide: QrService, useValue: mockQrService },
      ],
    }).compile();

    service = module.get<DischargeRequestsService>(DischargeRequestsService);
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
      prisma.inventoryItem.findUnique.mockResolvedValue(mockInventoryItem);

      const result = await service.createFromPublicForm(dto);

      expect(result.requestsCreated).toBe(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'CREATE',
          entity: 'DischargeRequest',
        }),
      );
    });

    it('throws NotFoundException when inventory item not found', async () => {
      prisma.inventoryItem.findUnique.mockResolvedValue(null);

      await expect(service.createFromPublicForm(dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when insufficient quantity', async () => {
      const dtoOverRequest = {
        ...dto,
        items: [{ inventoryItemId: 'item-1', quantity: 999 }],
      };
      prisma.inventoryItem.findUnique.mockResolvedValue(mockInventoryItem);

      await expect(
        service.createFromPublicForm(dtoOverRequest),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAvailableItems', () => {
    it('returns items with quantity > 0 and not deleted', async () => {
      prisma.inventoryItem.findMany.mockResolvedValue([mockInventoryItem]);

      const result = await service.getAvailableItems();

      expect(result).toHaveLength(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.inventoryItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { quantity: { gt: 0 }, deletedAt: null },
        }),
      );
    });
  });

  describe('findAll', () => {
    it('returns paginated requests', async () => {
      prisma.dischargeRequest.findMany.mockResolvedValue([mockRequest]);
      prisma.dischargeRequest.count.mockResolvedValue(1);

      const result = await service.findAll({});

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('filters by status when provided', async () => {
      prisma.dischargeRequest.findMany.mockResolvedValue([mockRequest]);
      prisma.dischargeRequest.count.mockResolvedValue(1);

      await service.findAll({ status: DischargeRequestStatus.PENDING });

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.dischargeRequest.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            status: DischargeRequestStatus.PENDING,
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('returns request by id', async () => {
      prisma.dischargeRequest.findUnique.mockResolvedValue(mockRequest);

      const result = await service.findOne('req-1');

      expect(result).toEqual(mockRequest);
    });

    it('throws NotFoundException when not found', async () => {
      prisma.dischargeRequest.findUnique.mockResolvedValue(null);

      await expect(service.findOne('not-found')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('complete', () => {
    it('completes a pending request and decrements inventory', async () => {
      prisma.dischargeRequest.findUnique.mockResolvedValue(mockRequest);

      const result = await service.complete('req-1', 'user-1');

      expect(result.status).toBe(DischargeRequestStatus.COMPLETED);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE',
          entity: 'DischargeRequest',
        }),
      );
    });

    it('throws BadRequestException when request is not PENDING', async () => {
      const completedRequest = {
        ...mockRequest,
        status: DischargeRequestStatus.COMPLETED,
      } as unknown as DischargeRequest;
      prisma.dischargeRequest.findUnique.mockResolvedValue(completedRequest);

      await expect(service.complete('req-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when request not found', async () => {
      prisma.dischargeRequest.findUnique.mockResolvedValue(null);

      await expect(service.complete('not-found', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reject', () => {
    it('rejects a pending request with reason', async () => {
      const rejectedRequest = {
        ...mockRequest,
        status: DischargeRequestStatus.REJECTED,
        rejectedReason: 'No budget',
      } as unknown as DischargeRequest;
      prisma.dischargeRequest.findUnique.mockResolvedValue(mockRequest);
      prisma.dischargeRequest.update.mockResolvedValue(rejectedRequest);

      const result = await service.reject('req-1', 'user-1', 'No budget');

      expect(result.status).toBe(DischargeRequestStatus.REJECTED);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          changes: expect.objectContaining({
            status: 'REJECTED',
            reason: 'No budget',
          }),
        }),
      );
    });

    it('throws BadRequestException when request is not PENDING', async () => {
      const rejectedRequest = {
        ...mockRequest,
        status: DischargeRequestStatus.REJECTED,
      } as unknown as DischargeRequest;
      prisma.dischargeRequest.findUnique.mockResolvedValue(rejectedRequest);

      await expect(service.reject('req-1', 'user-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getStats', () => {
    it('returns counts by status', async () => {
      prisma.dischargeRequest.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(4) // pending
        .mockResolvedValueOnce(5) // completed
        .mockResolvedValueOnce(1); // rejected

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
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(qrService.generateUrlQrDataUrl).toHaveBeenCalled();
    });
  });
});
