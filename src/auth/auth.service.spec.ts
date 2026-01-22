import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import * as bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt', () => ({
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
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

      expect(result).toEqual({
        access_token: 'jwt-token-123',
        user: {
          id: mockUser.id,
          email: mockUser.email,
          name: mockUser.name,
          role: mockUser.role,
        },
      });
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
    it('should create a new user and return access token', async () => {
      const newUser = { ...mockUser, id: 'new-user-123' };
      usersService.findByEmail.mockResolvedValue(null);
      usersService.create.mockResolvedValue(newUser);
      jwtService.sign.mockReturnValue('jwt-token-new');

      const result = await service.register({
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      });

      expect(result).toEqual({
        access_token: 'jwt-token-new',
        user: newUser,
      });
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
      const userWithoutPassword = { ...mockUser };
      delete (userWithoutPassword as any).password;
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
});
