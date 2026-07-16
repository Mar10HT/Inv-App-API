import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma, type Category } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('test error', {
    code,
    clientVersion: '6.x',
  });

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: DeepMockProxy<PrismaService>;

  const mockCategory = {
    id: 'category-123',
    name: 'Electronics',
    description: 'Electronic items',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as Category;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
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

    service = module.get<CategoriesService>(CategoriesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a category successfully', async () => {
      prisma.category.create.mockResolvedValue(mockCategory);

      const result = (await service.create({
        name: 'Electronics',
        description: 'Electronic items',
      })) as Category;

      expect(result).toEqual(mockCategory);
      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: {
          name: 'Electronics',
          description: 'Electronic items',
        },
      });
    });

    it('should throw ConflictException if category name already exists', async () => {
      prisma.category.create.mockRejectedValue(prismaError('P2002'));

      await expect(service.create({ name: 'Electronics' })).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return paginated categories', async () => {
      const categories = [mockCategory];
      prisma.category.findMany.mockResolvedValue(categories);
      prisma.category.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(categories);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should sort by name ascending by default', async () => {
      prisma.category.findMany.mockResolvedValue([]);
      prisma.category.count.mockResolvedValue(0);

      await service.findAll();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        }),
      );
    });

    it('should use default pagination when not provided', async () => {
      prisma.category.findMany.mockResolvedValue([]);
      prisma.category.count.mockResolvedValue(0);

      const result = await service.findAll();

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return a category by ID', async () => {
      prisma.category.findUnique.mockResolvedValue(mockCategory);

      const result = (await service.findOne('category-123')) as Category;

      expect(result).toEqual(mockCategory);
    });

    it('should throw NotFoundException if category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a category', async () => {
      const updatedCategory = { ...mockCategory, name: 'Updated Electronics' };
      prisma.category.update.mockResolvedValue(updatedCategory);

      const result = (await service.update('category-123', {
        name: 'Updated Electronics',
      })) as Category;

      expect(result.name).toBe('Updated Electronics');
    });

    it('should throw ConflictException if name already exists', async () => {
      prisma.category.update.mockRejectedValue(prismaError('P2002'));

      await expect(
        service.update('category-123', { name: 'Existing Name' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if category does not exist', async () => {
      prisma.category.update.mockRejectedValue(prismaError('P2025'));

      await expect(
        service.update('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a category', async () => {
      prisma.category.delete.mockResolvedValue(mockCategory);

      await service.remove('category-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: 'category-123' },
      });
    });

    it('should throw NotFoundException if category does not exist', async () => {
      prisma.category.delete.mockRejectedValue(prismaError('P2025'));

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
