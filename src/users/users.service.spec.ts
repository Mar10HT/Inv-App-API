import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let prisma: jest.Mocked<PrismaService>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    password: 'hashedPassword123',
    name: 'Test User',
    role: 'USER' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockUserWithoutPassword = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'USER' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new user successfully', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.create({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: 'USER',
      });

      expect(result).not.toHaveProperty('password');
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      (prisma.user.create as jest.Mock).mockRejectedValue({ code: 'P2002' });

      await expect(
        service.create({
          email: 'existing@example.com',
          password: 'password123',
          name: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const users = [mockUserWithoutPassword];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(users);
      (prisma.user.count as jest.Mock).mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(users);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should exclude soft-deleted users', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });

    it('should use default pagination when not provided', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      const result = await service.findAll();

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUserWithoutPassword);

      const result = await service.findOne('user-123');

      expect(result).toEqual(mockUserWithoutPassword);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const updatedUser = { ...mockUserWithoutPassword, name: 'Updated Name' };
      (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

      const result = await service.update('user-123', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw ConflictException if email already exists', async () => {
      (prisma.user.update as jest.Mock).mockRejectedValue({ code: 'P2002' });

      await expect(
        service.update('user-123', { email: 'existing@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      (prisma.user.update as jest.Mock).mockRejectedValue({ code: 'P2025' });

      await expect(
        service.update('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete a user', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      });

      await service.remove('user-123');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      (prisma.user.update as jest.Mock).mockRejectedValue({ code: 'P2025' });

      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted user', async () => {
      const deletedUser = { ...mockUser, deletedAt: new Date() };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(deletedUser);
      (prisma.user.update as jest.Mock).mockResolvedValue({
        ...mockUserWithoutPassword,
        deletedAt: null,
      });

      const result = await service.restore('user-123');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { deletedAt: null },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.restore('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if user is not deleted', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      await expect(service.restore('user-123')).rejects.toThrow(ConflictException);
    });
  });

  describe('findByEmail', () => {
    it('should return a user by email', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should return null if user does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findOneWithPassword', () => {
    it('should return user with password', async () => {
      const userWithPassword = {
        id: 'user-123',
        email: 'test@example.com',
        password: 'hashedPassword',
      };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(userWithPassword);

      const result = await service.findOneWithPassword('user-123');

      expect(result).toEqual(userWithPassword);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        select: {
          id: true,
          email: true,
          password: true,
        },
      });
    });
  });

  describe('updatePassword', () => {
    it('should update user password', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      });

      const result = await service.updatePassword('user-123', 'newHashedPassword');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { password: 'newHashedPassword' },
        select: {
          id: true,
          email: true,
        },
      });
    });
  });
});
