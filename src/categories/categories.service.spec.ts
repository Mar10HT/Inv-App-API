import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: jest.Mocked<PrismaService>;

  const mockCategory = {
    id: 'category-123',
    name: 'Electronics',
    description: 'Electronic items',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      category: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a category successfully', async () => {
      (prisma.category.create as jest.Mock).mockResolvedValue(mockCategory);

      const result = await service.create({
        name: 'Electronics',
        description: 'Electronic items',
      });

      expect(result).toEqual(mockCategory);
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: {
          name: 'Electronics',
          description: 'Electronic items',
        },
      });
    });

    it('should throw ConflictException if category name already exists', async () => {
      (prisma.category.create as jest.Mock).mockRejectedValue({ code: 'P2002' });

      await expect(
        service.create({ name: 'Electronics' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated categories', async () => {
      const categories = [mockCategory];
      (prisma.category.findMany as jest.Mock).mockResolvedValue(categories);
      (prisma.category.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(categories);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should sort by name ascending by default', async () => {
      (prisma.category.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.category.count as jest.Mock).mockResolvedValue(0);

      await service.findAll();

      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { name: 'asc' },
        }),
      );
    });

    it('should use default pagination when not provided', async () => {
      (prisma.category.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.category.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAll();

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return a category by ID', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(mockCategory);

      const result = await service.findOne('category-123');

      expect(result).toEqual(mockCategory);
    });

    it('should throw NotFoundException if category does not exist', async () => {
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a category', async () => {
      const updatedCategory = { ...mockCategory, name: 'Updated Electronics' };
      (prisma.category.update as jest.Mock).mockResolvedValue(updatedCategory);

      const result = await service.update('category-123', { name: 'Updated Electronics' });

      expect(result.name).toBe('Updated Electronics');
    });

    it('should throw ConflictException if name already exists', async () => {
      (prisma.category.update as jest.Mock).mockRejectedValue({ code: 'P2002' });

      await expect(
        service.update('category-123', { name: 'Existing Name' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if category does not exist', async () => {
      (prisma.category.update as jest.Mock).mockRejectedValue({ code: 'P2025' });

      await expect(
        service.update('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a category', async () => {
      (prisma.category.delete as jest.Mock).mockResolvedValue(mockCategory);

      await service.remove('category-123');

      expect(prisma.category.delete).toHaveBeenCalledWith({
        where: { id: 'category-123' },
      });
    });

    it('should throw NotFoundException if category does not exist', async () => {
      (prisma.category.delete as jest.Mock).mockRejectedValue({ code: 'P2025' });

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });
});
