import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LoansService } from './loans.service';
import { PrismaService } from '../prisma/prisma.service';
import { QrService } from '../qr/qr.service';
import { EventsService } from '../events/events.service';
import { AuditService } from '../audit/audit.service';

describe('LoansService', () => {
  let service: LoansService;
  let prisma: jest.Mocked<PrismaService>;

  const mockWarehouse = {
    id: 'warehouse-123',
    name: 'Main Warehouse',
    location: 'Building A',
  };

  const mockDestWarehouse = {
    id: 'warehouse-456',
    name: 'Secondary Warehouse',
    location: 'Building B',
  };

  const mockInventoryItem = {
    id: 'item-123',
    name: 'Laptop',
    warehouseId: 'warehouse-123',
    quantity: 1,
  };

  const mockLoan = {
    id: 'loan-123',
    inventoryItemId: 'item-123',
    quantity: 1,
    sourceWarehouseId: 'warehouse-123',
    destinationWarehouseId: 'warehouse-456',
    status: 'PENDING',
    loanDate: new Date(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    returnDate: null,
    createdById: 'user-123',
    notes: null,
    inventoryItem: mockInventoryItem,
    sourceWarehouse: mockWarehouse,
    destinationWarehouse: mockDestWarehouse,
    createdBy: { id: 'user-123', email: 'user@test.com', name: 'Test User' },
  };

  beforeEach(async () => {
    const mockPrismaService = {
      loan: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      inventoryItem: {
        findUnique: jest.fn(),
      },
      warehouse: {
        findUnique: jest.fn(),
      },
    };

    const mockQrService = {
      generateCode: jest.fn(() => 'QR-CODE-123'),
      generateQrDataUrl: jest.fn().mockResolvedValue('data:image/png;base64,FAKE'),
      parseQrData: jest.fn(),
    };

    const mockEventsService = {
      emitLoanChange: jest.fn(),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: QrService, useValue: mockQrService },
        { provide: EventsService, useValue: mockEventsService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<LoansService>(LoansService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createLoanDto = {
      inventoryItemId: 'item-123',
      quantity: 1,
      sourceWarehouseId: 'warehouse-123',
      destinationWarehouseId: 'warehouse-456',
      dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };

    it('should create a loan successfully', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(mockInventoryItem);
      (prisma.loan.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.warehouse.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockWarehouse)
        .mockResolvedValueOnce(mockDestWarehouse);
      (prisma.loan.create as jest.Mock).mockResolvedValue(mockLoan);

      const result = await service.create(createLoanDto, 'user-123');

      expect(result).toEqual(mockLoan);
      expect(prisma.loan.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if source and destination warehouses are the same', async () => {
      await expect(
        service.create(
          {
            ...createLoanDto,
            destinationWarehouseId: 'warehouse-123',
          },
          'user-123',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if inventory item does not exist', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.create(createLoanDto, 'user-123')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if item does not belong to source warehouse', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue({
        ...mockInventoryItem,
        warehouseId: 'different-warehouse',
      });

      await expect(service.create(createLoanDto, 'user-123')).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if item is already on loan', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(mockInventoryItem);
      (prisma.loan.findFirst as jest.Mock).mockResolvedValue(mockLoan);

      await expect(service.create(createLoanDto, 'user-123')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if warehouse does not exist', async () => {
      (prisma.inventoryItem.findUnique as jest.Mock).mockResolvedValue(mockInventoryItem);
      (prisma.loan.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.create(createLoanDto, 'user-123')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated loans', async () => {
      const loans = [mockLoan];
      (prisma.loan.findMany as jest.Mock).mockResolvedValue(loans);
      (prisma.loan.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(loans);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should use default pagination when not provided', async () => {
      (prisma.loan.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.loan.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAll();

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return a loan by ID', async () => {
      (prisma.loan.findUnique as jest.Mock).mockResolvedValue(mockLoan);

      const result = await service.findOne('loan-123');

      expect(result).toEqual(mockLoan);
    });

    it('should throw NotFoundException if loan does not exist', async () => {
      (prisma.loan.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findActive', () => {
    it('should return active and overdue loans', async () => {
      const activeLoans = [
        mockLoan,
        { ...mockLoan, id: 'loan-456', status: 'OVERDUE' },
      ];
      (prisma.loan.findMany as jest.Mock).mockResolvedValue(activeLoans);

      const result = await service.findActive();

      expect(result).toHaveLength(2);
      expect(prisma.loan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['PENDING', 'SENT', 'RECEIVED', 'RETURN_PENDING', 'OVERDUE'] },
          }),
          orderBy: { loanDate: 'desc' },
          include: expect.any(Object),
        }),
      );
    });
  });

  describe('returnLoan', () => {
    it('should return a loan successfully', async () => {
      (prisma.loan.findUnique as jest.Mock).mockResolvedValue(mockLoan);
      (prisma.loan.update as jest.Mock).mockResolvedValue({
        ...mockLoan,
        status: 'RETURNED',
        returnDate: new Date(),
      });

      const result = await service.returnLoan('loan-123');

      expect(result.status).toBe('RETURNED');
      expect(result.returnDate).toBeDefined();
    });

    it('should throw BadRequestException if loan is already returned', async () => {
      (prisma.loan.findUnique as jest.Mock).mockResolvedValue({
        ...mockLoan,
        status: 'RETURNED',
      });

      await expect(service.returnLoan('loan-123')).rejects.toThrow(BadRequestException);
    });

    it('should append notes when returning a loan', async () => {
      (prisma.loan.findUnique as jest.Mock).mockResolvedValue({
        ...mockLoan,
        notes: 'Original notes',
      });
      (prisma.loan.update as jest.Mock).mockImplementation((args) => {
        return Promise.resolve({
          ...mockLoan,
          ...args.data,
        });
      });

      await service.returnLoan('loan-123', { notes: 'Return notes' });

      expect(prisma.loan.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: 'Original notes\nReturn notes',
          }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('should delete a loan', async () => {
      (prisma.loan.delete as jest.Mock).mockResolvedValue(mockLoan);

      await service.remove('loan-123');

      expect(prisma.loan.delete).toHaveBeenCalledWith({
        where: { id: 'loan-123' },
      });
    });

    it('should throw NotFoundException if loan does not exist', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Record not found',
        { code: 'P2025', clientVersion: '6.19.0' },
      );
      (prisma.loan.delete as jest.Mock).mockRejectedValue(prismaError);

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('should return loan statistics', async () => {
      (prisma.loan.count as jest.Mock)
        .mockResolvedValueOnce(2)   // totalPending
        .mockResolvedValueOnce(3)   // totalSent
        .mockResolvedValueOnce(4)   // totalReceived
        .mockResolvedValueOnce(1)   // totalReturnPending
        .mockResolvedValueOnce(50)  // totalReturned
        .mockResolvedValueOnce(3)   // totalOverdue
        .mockResolvedValueOnce(5);  // dueSoon

      const result = await service.getStats();

      expect(result).toEqual({
        totalPending: 2,
        totalSent: 3,
        totalReceived: 4,
        totalReturnPending: 1,
        totalReturned: 50,
        totalOverdue: 3,
        dueSoon: 5,
        totalActive: 10,
      });
    });
  });

  describe('isItemOnLoan', () => {
    it('should return true if item is on active loan', async () => {
      (prisma.loan.findFirst as jest.Mock).mockResolvedValue(mockLoan);

      const result = await service.isItemOnLoan('item-123');

      expect(result).toBe(true);
    });

    it('should return false if item is not on loan', async () => {
      (prisma.loan.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.isItemOnLoan('item-123');

      expect(result).toBe(false);
    });
  });

  describe('checkOverdueLoans', () => {
    it('should update overdue loans status', async () => {
      (prisma.loan.updateMany as jest.Mock).mockResolvedValue({ count: 5 });

      await service.checkOverdueLoans();

      expect(prisma.loan.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['SENT', 'RECEIVED'] },
            dueDate: { lt: expect.any(Date) },
          }),
          data: {
            status: 'OVERDUE',
          },
        }),
      );
    });
  });

  describe('findByItem', () => {
    it('should return loans for a specific inventory item', async () => {
      const itemLoans = [mockLoan];
      (prisma.loan.findMany as jest.Mock).mockResolvedValue(itemLoans);

      const result = await service.findByItem('item-123');

      expect(result).toEqual(itemLoans);
      expect(prisma.loan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ inventoryItemId: 'item-123' }),
          orderBy: { loanDate: 'desc' },
          include: expect.any(Object),
        }),
      );
    });
  });

  describe('findByWarehouse', () => {
    it('should return loans for a specific warehouse (source or destination)', async () => {
      (prisma.loan.findMany as jest.Mock).mockResolvedValue([mockLoan]);

      const result = await service.findByWarehouse('warehouse-123');

      expect(result).toHaveLength(1);
      expect(prisma.loan.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { sourceWarehouseId: 'warehouse-123' },
              { destinationWarehouseId: 'warehouse-123' },
            ],
          },
          orderBy: { loanDate: 'desc' },
          include: expect.any(Object),
        }),
      );
    });
  });
});
