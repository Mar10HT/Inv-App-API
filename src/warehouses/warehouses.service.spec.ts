import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WarehousesService } from './warehouses.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('test error', {
    code,
    clientVersion: '6.x',
  });

describe('WarehousesService', () => {
  let service: WarehousesService;
  let prisma: jest.Mocked<PrismaService>;

  const mockWarehouse = {
    id: 'warehouse-123',
    name: 'Main Warehouse',
    location: 'Building A',
    description: 'Main storage facility',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { inventoryItems: 50 },
  };

  beforeEach(async () => {
    const mockPrismaService: any = {
      warehouse: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'manager-1' }),
      },
      userWarehouse: {
        upsert: jest.fn(),
      },
    };
    mockPrismaService.$transaction = jest.fn((cb: (tx: any) => any) =>
      cb(mockPrismaService),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehousesService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
            logSafe: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WarehousesService>(WarehousesService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a warehouse successfully', async () => {
      (prisma.warehouse.create as jest.Mock).mockResolvedValue(mockWarehouse);

      const result = await service.create({
        name: 'Main Warehouse',
        location: 'Building A',
        description: 'Main storage facility',
      });

      expect(result).toEqual(mockWarehouse);
      expect(prisma.warehouse.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated warehouses', async () => {
      const warehouses = [mockWarehouse];
      (prisma.warehouse.findMany as jest.Mock).mockResolvedValue(warehouses);
      (prisma.warehouse.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(warehouses);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should include inventory items count and manager', async () => {
      (prisma.warehouse.findMany as jest.Mock).mockResolvedValue([
        mockWarehouse,
      ]);
      (prisma.warehouse.count as jest.Mock).mockResolvedValue(1);

      await service.findAll();

      expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            manager: expect.objectContaining({
              select: expect.objectContaining({
                id: true,
                name: true,
                email: true,
              }),
            }),
            _count: { select: { inventoryItems: true } },
          }),
        }),
      );
    });

    it('should use default pagination when not provided', async () => {
      (prisma.warehouse.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.warehouse.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAll();

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });

    it('should sort by createdAt descending by default', async () => {
      (prisma.warehouse.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.warehouse.count as jest.Mock).mockResolvedValue(0);

      await service.findAll();

      expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a warehouse by ID', async () => {
      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue(
        mockWarehouse,
      );

      const result = await service.findOne('warehouse-123');

      expect(result).toEqual(mockWarehouse);
    });

    it('should include inventory items', async () => {
      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue(
        mockWarehouse,
      );

      await service.findOne('warehouse-123');

      expect(prisma.warehouse.findUnique).toHaveBeenCalledWith({
        where: { id: 'warehouse-123' },
        include: expect.objectContaining({
          inventoryItems: true,
        }),
      });
    });

    it('should throw NotFoundException if warehouse does not exist', async () => {
      (prisma.warehouse.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a warehouse', async () => {
      const updatedWarehouse = { ...mockWarehouse, name: 'Updated Warehouse' };
      (prisma.warehouse.update as jest.Mock).mockResolvedValue(
        updatedWarehouse,
      );

      const result = await service.update('warehouse-123', {
        name: 'Updated Warehouse',
      });

      expect(result.name).toBe('Updated Warehouse');
    });

    it('should throw NotFoundException if warehouse does not exist', async () => {
      (prisma.warehouse.update as jest.Mock).mockRejectedValue(
        prismaError('P2025'),
      );

      await expect(
        service.update('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a warehouse', async () => {
      (prisma.warehouse.delete as jest.Mock).mockResolvedValue(mockWarehouse);

      await service.remove('warehouse-123');

      expect(prisma.warehouse.delete).toHaveBeenCalledWith({
        where: { id: 'warehouse-123' },
      });
    });

    it('should throw NotFoundException if warehouse does not exist', async () => {
      (prisma.warehouse.delete as jest.Mock).mockRejectedValue(
        prismaError('P2025'),
      );

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
