import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma, type Warehouse, type User } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
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
  let prisma: DeepMockProxy<PrismaService>;

  const mockWarehouse = {
    id: 'warehouse-123',
    name: 'Main Warehouse',
    location: 'Building A',
    description: 'Main storage facility',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { inventoryItems: 50 },
  } as unknown as Warehouse;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    prisma.user.findUnique.mockResolvedValue({
      id: 'manager-1',
    } as unknown as User);
    prisma.$transaction.mockImplementation(((
      cb: (tx: DeepMockProxy<PrismaService>) => unknown,
    ) => cb(prisma)) as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WarehousesService,
        { provide: PrismaService, useValue: prisma },
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
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a warehouse successfully', async () => {
      prisma.warehouse.create.mockResolvedValue(mockWarehouse);

      const result = await service.create({
        name: 'Main Warehouse',
        location: 'Building A',
        description: 'Main storage facility',
      });

      expect(result).toEqual(mockWarehouse);
      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.warehouse.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated warehouses', async () => {
      const warehouses = [mockWarehouse];
      prisma.warehouse.findMany.mockResolvedValue(warehouses);
      prisma.warehouse.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(warehouses);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should include inventory items count and manager', async () => {
      prisma.warehouse.findMany.mockResolvedValue([mockWarehouse]);
      prisma.warehouse.count.mockResolvedValue(1);

      await service.findAll();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          include: expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            manager: expect.objectContaining({
              // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
      prisma.warehouse.findMany.mockResolvedValue([]);
      prisma.warehouse.count.mockResolvedValue(0);

      const result = await service.findAll();

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });

    it('should sort by createdAt descending by default', async () => {
      prisma.warehouse.findMany.mockResolvedValue([]);
      prisma.warehouse.count.mockResolvedValue(0);

      await service.findAll();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.warehouse.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a warehouse by ID', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);

      const result = await service.findOne('warehouse-123');

      expect(result).toEqual(mockWarehouse);
    });

    it('should include inventory items', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(mockWarehouse);

      await service.findOne('warehouse-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.warehouse.findUnique).toHaveBeenCalledWith({
        where: { id: 'warehouse-123' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        include: expect.objectContaining({
          inventoryItems: true,
        }),
      });
    });

    it('should throw NotFoundException if warehouse does not exist', async () => {
      prisma.warehouse.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a warehouse', async () => {
      const updatedWarehouse = {
        ...mockWarehouse,
        name: 'Updated Warehouse',
      } as unknown as Warehouse;
      prisma.warehouse.update.mockResolvedValue(updatedWarehouse);

      const result = await service.update('warehouse-123', {
        name: 'Updated Warehouse',
      });

      expect(result.name).toBe('Updated Warehouse');
    });

    it('should throw NotFoundException if warehouse does not exist', async () => {
      prisma.warehouse.update.mockRejectedValue(prismaError('P2025'));

      await expect(
        service.update('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a warehouse', async () => {
      prisma.warehouse.delete.mockResolvedValue(mockWarehouse);

      await service.remove('warehouse-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.warehouse.delete).toHaveBeenCalledWith({
        where: { id: 'warehouse-123' },
      });
    });

    it('should throw NotFoundException if warehouse does not exist', async () => {
      prisma.warehouse.delete.mockRejectedValue(prismaError('P2025'));

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
