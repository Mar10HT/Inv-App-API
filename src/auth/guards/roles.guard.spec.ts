import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  const mockExecutionContext = {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn(),
    }),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const mockReflector = {
      getAllAndOverride: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesGuard,
        { provide: Reflector, useValue: mockReflector },
      ],
    }).compile();

    guard = module.get<RolesGuard>(RolesGuard);
    reflector = module.get(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should allow access when no roles are required', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(undefined);

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should allow access when roles array is empty', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user is not authenticated', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['SYSTEM_ADMIN']);
      (mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue({
        user: undefined,
      });

      expect(() => guard.canActivate(mockExecutionContext)).toThrow(ForbiddenException);
      expect(() => guard.canActivate(mockExecutionContext)).toThrow('User not authenticated');
    });

    it('should allow access when user has required role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['SYSTEM_ADMIN']);
      (mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue({
        user: { id: 'user-123', role: 'SYSTEM_ADMIN' },
      });

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should allow access when user has one of multiple required roles', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        'SYSTEM_ADMIN',
        'WAREHOUSE_MANAGER',
      ]);
      (mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue({
        user: { id: 'user-123', role: 'WAREHOUSE_MANAGER' },
      });

      const result = guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
    });

    it('should throw ForbiddenException when user does not have required role', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(['SYSTEM_ADMIN']);
      (mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue({
        user: { id: 'user-123', role: 'USER' },
      });

      expect(() => guard.canActivate(mockExecutionContext)).toThrow(ForbiddenException);
    });

    it('should include role information in error message', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
        'SYSTEM_ADMIN',
        'WAREHOUSE_MANAGER',
      ]);
      (mockExecutionContext.switchToHttp().getRequest as jest.Mock).mockReturnValue({
        user: { id: 'user-123', role: 'VIEWER' },
      });

      try {
        guard.canActivate(mockExecutionContext);
        fail('Expected ForbiddenException to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(error.message).toContain('SYSTEM_ADMIN');
        expect(error.message).toContain('WAREHOUSE_MANAGER');
        expect(error.message).toContain('VIEWER');
      }
    });
  });
});
