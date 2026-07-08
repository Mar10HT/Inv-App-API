import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Prisma, type Supplier } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { SuppliersService } from './suppliers.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('test error', {
    code,
    clientVersion: '6.x',
  });

describe('SuppliersService', () => {
  let service: SuppliersService;
  let prisma: DeepMockProxy<PrismaService>;

  const mockSupplier = {
    id: 'supplier-123',
    name: 'Test Supplier',
    contactName: 'John Doe',
    email: 'supplier@test.com',
    phone: '123-456-7890',
    address: '123 Main St',
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { inventoryItems: 5 },
  } as unknown as Supplier;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuppliersService,
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

    service = module.get<SuppliersService>(SuppliersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a supplier successfully', async () => {
      prisma.supplier.create.mockResolvedValue(mockSupplier);

      const result = (await service.create({
        name: 'Test Supplier',
        contactName: 'John Doe',
        email: 'supplier@test.com',
        phone: '123-456-7890',
        address: '123 Main St',
      })) as Supplier;

      expect(result).toEqual(mockSupplier);
      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.supplier.create).toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return paginated suppliers', async () => {
      const suppliers = [mockSupplier];
      prisma.supplier.findMany.mockResolvedValue(suppliers);
      prisma.supplier.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(suppliers);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should include inventory items count', async () => {
      prisma.supplier.findMany.mockResolvedValue([mockSupplier]);
      prisma.supplier.count.mockResolvedValue(1);

      await service.findAll();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.supplier.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: {
            _count: {
              select: { inventoryItems: true },
            },
          },
        }),
      );
    });

    it('should use default pagination when not provided', async () => {
      prisma.supplier.findMany.mockResolvedValue([]);
      prisma.supplier.count.mockResolvedValue(0);

      const result = await service.findAll();

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return a supplier by ID', async () => {
      prisma.supplier.findUnique.mockResolvedValue(mockSupplier);

      const result = (await service.findOne('supplier-123')) as Supplier;

      expect(result).toEqual(mockSupplier);
    });

    it('should include inventory items', async () => {
      prisma.supplier.findUnique.mockResolvedValue(mockSupplier);

      await service.findOne('supplier-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.supplier.findUnique).toHaveBeenCalledWith({
        where: { id: 'supplier-123' },
        // jest's expect.objectContaining() return type is `any` in the
        // installed @types/jest — a known, long-standing typing gap.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        include: expect.objectContaining({
          inventoryItems: true,
        }),
      });
    });

    it('should throw NotFoundException if supplier does not exist', async () => {
      prisma.supplier.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a supplier', async () => {
      const updatedSupplier = { ...mockSupplier, name: 'Updated Supplier' };
      prisma.supplier.update.mockResolvedValue(updatedSupplier);

      const result = (await service.update('supplier-123', {
        name: 'Updated Supplier',
      })) as Supplier;

      expect(result.name).toBe('Updated Supplier');
    });

    it('should throw NotFoundException if supplier does not exist', async () => {
      prisma.supplier.update.mockRejectedValue(prismaError('P2025'));

      await expect(
        service.update('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a supplier', async () => {
      prisma.supplier.delete.mockResolvedValue(mockSupplier);

      await service.remove('supplier-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.supplier.delete).toHaveBeenCalledWith({
        where: { id: 'supplier-123' },
      });
    });

    it('should throw NotFoundException if supplier does not exist', async () => {
      prisma.supplier.delete.mockRejectedValue(prismaError('P2025'));

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
