import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

const prismaError = (code: string) =>
  new Prisma.PrismaClientKnownRequestError('test error', {
    code,
    clientVersion: '6.x',
  });
import * as bcrypt from 'bcryptjs';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
}));

describe('UsersService', () => {
  let service: UsersService;
  let prisma: DeepMockProxy<PrismaService>;
  let audit: { log: jest.Mock; logSafe: jest.Mock };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    password: 'hashedPassword123',
    name: 'Test User',
    role: 'USER' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  } as unknown as User;

  const mockUserWithoutPassword = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'USER' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as User;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const mockEmailService = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordChangedEmail: jest.fn().mockResolvedValue(true),
    };

    const mockAuditService = {
      log: jest.fn().mockResolvedValue(undefined),
      logSafe: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: PrismaService, useValue: prisma },
        { provide: EmailService, useValue: mockEmailService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    audit = module.get(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new user successfully', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      prisma.user.create.mockResolvedValue(mockUser);

      const result = await service.create({
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        role: 'USER',
      });

      expect(result).not.toHaveProperty('password');
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if email already exists', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashedPassword');
      prisma.user.create.mockRejectedValue(prismaError('P2002'));

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
      prisma.user.findMany.mockResolvedValue(users);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(result.data).toEqual(users);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should exclude soft-deleted users', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          where: expect.objectContaining({
            deletedAt: null,
          }),
        }),
      );
    });

    it('should use default pagination when not provided', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.findAll();

      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
    });
  });

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUserWithoutPassword);

      const result = await service.findOne('user-123');

      expect(result).toEqual(mockUserWithoutPassword);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const updatedUser = {
        ...mockUserWithoutPassword,
        name: 'Updated Name',
      } as unknown as User;
      prisma.user.update.mockResolvedValue(updatedUser);

      const result = await service.update('user-123', { name: 'Updated Name' });

      expect(result.name).toBe('Updated Name');
    });

    it('should throw ConflictException if email already exists', async () => {
      prisma.user.update.mockRejectedValue(prismaError('P2002'));

      await expect(
        service.update('user-123', { email: 'existing@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prisma.user.update.mockRejectedValue(prismaError('P2025'));

      await expect(
        service.update('nonexistent', { name: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft delete a user', async () => {
      prisma.user.update.mockResolvedValue({
        ...mockUser,
        deletedAt: new Date(),
      } as unknown as User);

      await service.remove('user-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prisma.user.update.mockRejectedValue(prismaError('P2025'));

      await expect(service.remove('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('restore', () => {
    it('should restore a soft-deleted user', async () => {
      const deletedUser = {
        ...mockUser,
        deletedAt: new Date(),
      } as unknown as User;
      prisma.user.findUnique.mockResolvedValue(deletedUser);
      prisma.user.update.mockResolvedValue({
        ...mockUserWithoutPassword,
        deletedAt: null,
      } as unknown as User);

      await service.restore('user-123');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { deletedAt: null },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.restore('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException if user is not deleted', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.restore('user-123')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findByEmail', () => {
    it('should return a user by email', async () => {
      prisma.user.findFirst.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { email: 'test@example.com', deletedAt: null },
        }),
      );
    });

    it('should return null if user does not exist', async () => {
      prisma.user.findFirst.mockResolvedValue(null);

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
      } as unknown as User;
      prisma.user.findUnique.mockResolvedValue(userWithPassword);

      const result = await service.findOneWithPassword('user-123');

      expect(result).toEqual(userWithPassword);
      // eslint-disable-next-line @typescript-eslint/unbound-method
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
      prisma.user.update.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
      } as unknown as User);

      await service.updatePassword('user-123', 'newHashedPassword');

      // eslint-disable-next-line @typescript-eslint/unbound-method
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

  describe('adminSetPassword', () => {
    const strongPassword = 'Str0ng!Passw0rd';

    const actorAdmin: AuthenticatedUser = {
      userId: 'admin-1',
      email: 'admin@example.com',
      role: 'SYSTEM_ADMIN',
      warehouseIds: null,
    };

    const actorEditor: AuthenticatedUser = {
      userId: 'editor-1',
      email: 'editor@example.com',
      role: 'WAREHOUSE_MANAGER',
      warehouseIds: [],
    };

    const targetNormalUser = {
      id: 'user-123',
      email: 'Target@Example.com',
      name: 'Target User',
      role: 'USER' as const,
      deletedAt: null,
    };

    it('hashes the password, updates it, revokes sessions, clears lockout and audits', async () => {
      prisma.user.findUnique.mockResolvedValue(
        targetNormalUser as unknown as User,
      );
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');

      const result = await service.adminSetPassword(
        'user-123',
        strongPassword,
        actorEditor,
      );

      // Hashed with the same cost factor the login flow uses
      expect(bcrypt.hash).toHaveBeenCalledWith(strongPassword, 10);

      // All writes happen atomically
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      // Password write
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { password: 'newHashedPassword' },
      });

      // Revoke active refresh tokens (force re-login)
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', revoked: false },
        data: { revoked: true },
      });

      // Invalidate pending reset tokens
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-123', used: false },
        data: { used: true },
      });

      // Clear failed-attempt lockout (email normalised to lowercase)
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.loginAttempt.deleteMany).toHaveBeenCalledWith({
        where: { email: 'target@example.com' },
      });

      // Audit trail records who changed whose password, with context persisted in
      // changes.after (AuditService does not persist the `metadata` field).
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'PASSWORD_CHANGE',
          entity: 'user',
          entityId: 'user-123',
          userId: 'editor-1',
          changes: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            after: expect.objectContaining({
              resetByAdmin: true,
              actorEmail: 'editor@example.com',
              targetEmail: 'Target@Example.com',
            }),
          },
        }),
      );

      // Never leak the hash
      expect(result).not.toHaveProperty('password');
    });

    it('blocks an admin from resetting their OWN password via this endpoint', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: actorEditor.userId,
        email: actorEditor.email,
        name: 'Editor',
        role: 'WAREHOUSE_MANAGER',
        deletedAt: null,
      } as unknown as User);

      await expect(
        service.adminSetPassword(
          actorEditor.userId,
          strongPassword,
          actorEditor,
        ),
      ).rejects.toThrow(ForbiddenException);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.adminSetPassword('missing', strongPassword, actorAdmin),
      ).rejects.toThrow(NotFoundException);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the target user is soft-deleted', async () => {
      prisma.user.findUnique.mockResolvedValue({
        ...targetNormalUser,
        deletedAt: new Date(),
      } as unknown as User);

      await expect(
        service.adminSetPassword('user-123', strongPassword, actorAdmin),
      ).rejects.toThrow(NotFoundException);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('blocks a non-SYSTEM_ADMIN from resetting a SYSTEM_ADMIN password (privilege escalation)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-2',
        email: 'other-admin@example.com',
        name: 'Other Admin',
        role: 'SYSTEM_ADMIN',
        deletedAt: null,
      } as unknown as User);

      await expect(
        service.adminSetPassword('admin-2', strongPassword, actorEditor),
      ).rejects.toThrow(ForbiddenException);

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows a SYSTEM_ADMIN to reset another SYSTEM_ADMIN password', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-2',
        email: 'other-admin@example.com',
        name: 'Other Admin',
        role: 'SYSTEM_ADMIN',
        deletedAt: null,
      } as unknown as User);
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');

      await expect(
        service.adminSetPassword('admin-2', strongPassword, actorAdmin),
      ).resolves.toBeDefined();

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
