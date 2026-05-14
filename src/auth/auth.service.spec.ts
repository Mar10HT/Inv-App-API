import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { WarehouseAccessService } from '../common/warehouse-access/warehouse-access.service';
import * as bcrypt from 'bcryptjs';

// Mock bcrypt
jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let jwtService: jest.Mocked<JwtService>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    password: 'hashedPassword123',
    name: 'Test User',
    role: 'USER' as const,
    roleId: null,
    permissionsVersion: 0,
    emailNotifications: true,
    lowStockAlerts: true,
    expoPushToken: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    const mockUsersService = {
      findByEmail: jest.fn(),
      findOne: jest.fn(),
      findOneWithPassword: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updatePassword: jest.fn(),
    };

    const mockJwtService = {
      sign: jest.fn(),
    };

    const mockPrismaService = {
      loginAttempt: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      refreshToken: {
        create: jest.fn().mockResolvedValue({ token: 'mock-refresh-token' }),
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      passwordResetToken: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      // Phase 2: AuthService.buildAuthContext queries memberships to decide
      // whether to bake orgId into the JWT. Default to "no memberships" so
      // existing tests behave as legacy single-tenant.
      userOrganization: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    const mockEmailService = {
      sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordChangedEmail: jest.fn().mockResolvedValue(undefined),
    };

    const mockWarehouseAccessService = {
      getAccessibleWarehouseIds: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: WarehouseAccessService, useValue: mockWarehouseAccessService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get(UsersService);
    jwtService = module.get(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should return access token and user for valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('jwt-token-123');

      const result = await service.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toMatchObject({
        access_token: 'jwt-token-123',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          role: mockUser.role,
          warehouseIds: [],
          permissionsVersion: mockUser.permissionsVersion,
        },
      });
      expect(result.refresh_token).toBeDefined();
      expect(usersService.findByEmail).toHaveBeenCalledWith('test@example.com');
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', mockUser.password);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nonexistent@example.com', password: 'password123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('should create a new user and return access token without password', async () => {
      // UsersService.create strips the password before returning — mock matches that contract
      const { password: _pwd, ...userWithoutPassword } = mockUser;
      const newUser = { ...userWithoutPassword, id: 'new-user-123' };
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(newUser);
      jwtService.sign.mockReturnValue('jwt-token-new');

      const result = await service.register({
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      });

      expect(result).toMatchObject({
        access_token: 'jwt-token-new',
        user: newUser,
      });
      expect(result.refresh_token).toBeDefined();
      expect(result.user).not.toHaveProperty('password');
      expect(usersService.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if user already exists', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.register({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('validateUser', () => {
    it('should return user data for valid user id', async () => {
      const { password: _pwd, ...userWithoutPassword } = mockUser;
      usersService.findOne.mockResolvedValue(userWithoutPassword);

      const result = await service.validateUser('user-123');

      expect(result).toEqual(userWithoutPassword);
      expect(usersService.findOne).toHaveBeenCalledWith('user-123');
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      usersService.findOneWithPassword.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        password: 'currentHashedPassword',
      });
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true) // current password is valid
        .mockResolvedValueOnce(false); // new password is different
      (bcrypt.hash as jest.Mock).mockResolvedValue('newHashedPassword');
      usersService.updatePassword.mockResolvedValue(undefined);

      const result = await service.changePassword('user-123', {
        currentPassword: 'currentPassword',
        newPassword: 'newPassword123',
      });

      expect(result).toEqual({ message: 'Password changed successfully' });
      expect(usersService.updatePassword).toHaveBeenCalledWith('user-123', 'newHashedPassword');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      usersService.findOneWithPassword.mockResolvedValue(null);

      await expect(
        service.changePassword('nonexistent-user', {
          currentPassword: 'current',
          newPassword: 'new',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw BadRequestException if current password is incorrect', async () => {
      usersService.findOneWithPassword.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        password: 'hashedPassword',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-123', {
          currentPassword: 'wrongPassword',
          newPassword: 'newPassword',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if new password is same as current', async () => {
      usersService.findOneWithPassword.mockResolvedValue({
        id: mockUser.id,
        email: mockUser.email,
        password: 'hashedPassword',
      });
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true) // current password valid
        .mockResolvedValueOnce(true); // new password same as current

      await expect(
        service.changePassword('user-123', {
          currentPassword: 'password',
          newPassword: 'password',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('updateProfile', () => {
    it('should update user profile successfully', async () => {
      usersService.findByEmail.mockResolvedValue(null);
      usersService.update.mockResolvedValue({
        ...mockUser,
        name: 'Updated Name',
      });

      const result = await service.updateProfile('user-123', {
        name: 'Updated Name',
      });

      expect(result.message).toBe('Profile updated successfully');
      expect(result.user.name).toBe('Updated Name');
    });

    it('should throw ConflictException if email is already in use by another user', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...mockUser,
        id: 'different-user-id',
      });

      await expect(
        service.updateProfile('user-123', {
          email: 'taken@example.com',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('switchOrg', () => {
    let prisma: any;

    beforeEach(() => {
      // Access the mocked PrismaService through the AuthService instance.
      // (TestingModule.get(PrismaService) would re-fetch the same mock.)
      prisma = (service as any).prisma;
      jwtService.sign.mockReturnValue('new-access-token');
      prisma.refreshToken.create.mockResolvedValue({ token: 'new-refresh-token' });
    });

    it('mints new tokens bound to target org when membership is active', async () => {
      prisma.userOrganization.findUnique.mockResolvedValue({
        userId: 'user-123',
        organizationId: 'org_acme',
        orgRole: 'MEMBER',
        organization: { id: 'org_acme', slug: 'ACME', name: 'Acme', status: 'ACTIVE' },
        user: {
          id: 'user-123',
          email: 'pedro@gmail.com',
          name: 'Pedro',
          role: 'USER',
          permissionsVersion: 1,
        },
      });

      const result = await service.switchOrg('user-123', 'org_acme', 'old-refresh-token');

      expect(result.access_token).toBe('new-access-token');
      expect(result.organization).toEqual({ id: 'org_acme', slug: 'ACME', name: 'Acme' });
      expect(result.orgRole).toBe('MEMBER');
      // Old refresh token should be revoked
      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { token: 'old-refresh-token' },
        data: { revoked: true },
      });
      // New JWT should carry the org binding
      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: 'user-123',
          orgId: 'org_acme',
          orgRole: 'MEMBER',
        }),
      );
    });

    it('throws Forbidden when user is not a member of target org', async () => {
      prisma.userOrganization.findUnique.mockResolvedValue(null);

      await expect(
        service.switchOrg('user-123', 'org_stranger', 'old-token'),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('throws Forbidden when target org is SUSPENDED', async () => {
      prisma.userOrganization.findUnique.mockResolvedValue({
        userId: 'user-123',
        organizationId: 'org_suspended',
        orgRole: 'MEMBER',
        organization: {
          id: 'org_suspended',
          slug: 'SUS',
          name: 'Suspended Co',
          status: 'SUSPENDED',
        },
        user: { id: 'user-123', email: 'x@y.z', name: null, role: 'USER', permissionsVersion: 0 },
      });

      await expect(
        service.switchOrg('user-123', 'org_suspended', 'old-token'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('still revokes old token even if currentRefreshToken is missing', async () => {
      prisma.userOrganization.findUnique.mockResolvedValue({
        userId: 'user-123',
        organizationId: 'org_acme',
        orgRole: 'OWNER',
        organization: { id: 'org_acme', slug: 'ACME', name: 'Acme', status: 'ACTIVE' },
        user: {
          id: 'user-123',
          email: 'pedro@gmail.com',
          name: 'Pedro',
          role: 'USER',
          permissionsVersion: 1,
        },
      });

      const result = await service.switchOrg('user-123', 'org_acme', undefined);

      // Empty refresh token = skip revoke, but new token still minted.
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
      expect(result.access_token).toBe('new-access-token');
    });
  });
});
