import { Test, TestingModule } from '@nestjs/testing';
import type { User, RolePermission } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { PermissionsService } from './permissions.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let prisma: DeepMockProxy<PrismaService>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PermissionsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PermissionsService>(PermissionsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getPermissionsForUser', () => {
    it('returns just the permission keys array', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'STAFF',
        roleId: 'role-1',
        permissionsVersion: 3,
      } as unknown as User);
      prisma.rolePermission.findMany.mockResolvedValue([
        { permission: { key: 'inventory:view' } },
        { permission: { key: 'inventory:edit' } },
      ] as unknown as RolePermission[]);

      const result = await service.getPermissionsForUser('user-1');

      expect(result).toEqual(['inventory:view', 'inventory:edit']);
    });
  });

  describe('getPermissionsWithVersion', () => {
    it('returns empty permissions and version 0 when the user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      const result = await service.getPermissionsWithVersion('missing');

      expect(result).toEqual({ permissions: [], version: 0 });
      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });

    it('returns a wildcard permission for SYSTEM_ADMIN users', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'SYSTEM_ADMIN',
        roleId: null,
        permissionsVersion: 1,
      } as unknown as User);

      const result = await service.getPermissionsWithVersion('admin-1');

      expect(result).toEqual({ permissions: ['*'], version: 1 });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });

    it('returns an empty array when the user has no roleId assigned', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'STAFF',
        roleId: null,
        permissionsVersion: 2,
      } as unknown as User);

      const result = await service.getPermissionsWithVersion('user-1');

      expect(result).toEqual({ permissions: [], version: 2 });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    });

    it('resolves permissions from the role when roleId is present', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'STAFF',
        roleId: 'role-1',
        permissionsVersion: 5,
      } as unknown as User);
      prisma.rolePermission.findMany.mockResolvedValue([
        { permission: { key: 'inventory:view' } },
      ] as unknown as RolePermission[]);

      const result = await service.getPermissionsWithVersion('user-1');

      expect(result).toEqual({ permissions: ['inventory:view'], version: 5 });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.rolePermission.findMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1' },
        include: { permission: { select: { key: true } } },
      });
    });

    it('serves cached permissions within the TTL without hitting the database again', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'STAFF',
        roleId: 'role-1',
        permissionsVersion: 1,
      } as unknown as User);
      prisma.rolePermission.findMany.mockResolvedValue([
        { permission: { key: 'inventory:view' } },
      ] as unknown as RolePermission[]);

      const first = await service.getPermissionsWithVersion('user-1');
      const second = await service.getPermissionsWithVersion('user-1');

      expect(first).toEqual({ permissions: ['inventory:view'], version: 1 });
      expect(second).toEqual({ permissions: ['inventory:view'], version: 1 });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
    });

    it('re-fetches once the cache entry has expired (TTL = 60s)', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'STAFF',
        roleId: 'role-1',
        permissionsVersion: 1,
      } as unknown as User);
      prisma.rolePermission.findMany.mockResolvedValue([
        { permission: { key: 'inventory:view' } },
      ] as unknown as RolePermission[]);

      const nowSpy = jest.spyOn(Date, 'now');
      try {
        nowSpy.mockReturnValue(1_000_000);
        await service.getPermissionsWithVersion('user-1');

        nowSpy.mockReturnValue(1_000_000 + 60_001);
        await service.getPermissionsWithVersion('user-1');

        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
      } finally {
        nowSpy.mockRestore();
      }
    });
  });

  describe('getPermissionsForRole', () => {
    it('maps rolePermission records to permission keys', async () => {
      prisma.rolePermission.findMany.mockResolvedValue([
        { permission: { key: 'inventory:view' } },
        { permission: { key: 'inventory:create' } },
      ] as unknown as RolePermission[]);

      const result = await service.getPermissionsForRole('role-1');

      expect(result).toEqual(['inventory:view', 'inventory:create']);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.rolePermission.findMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1' },
        include: { permission: { select: { key: true } } },
      });
    });

    it('returns an empty array when the role has no permissions', async () => {
      prisma.rolePermission.findMany.mockResolvedValue([]);

      const result = await service.getPermissionsForRole('role-empty');

      expect(result).toEqual([]);
    });
  });

  describe('invalidateUserCache', () => {
    it('removes the cached entry so the next call re-fetches from the database', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'STAFF',
        roleId: 'role-1',
        permissionsVersion: 1,
      } as unknown as User);
      prisma.rolePermission.findMany.mockResolvedValue(
        [] as unknown as RolePermission[],
      );

      await service.getPermissionsWithVersion('user-1');
      service.invalidateUserCache('user-1');
      await service.getPermissionsWithVersion('user-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    });

    it('is a no-op for a user id that was never cached', () => {
      expect(() => service.invalidateUserCache('never-cached')).not.toThrow();
    });
  });

  describe('invalidateCacheForUsers', () => {
    it('removes cached entries for every given user id', async () => {
      prisma.user.findUnique.mockResolvedValue({
        role: 'STAFF',
        roleId: 'role-1',
        permissionsVersion: 1,
      } as unknown as User);
      prisma.rolePermission.findMany.mockResolvedValue(
        [] as unknown as RolePermission[],
      );

      await service.getPermissionsWithVersion('user-1');
      await service.getPermissionsWithVersion('user-2');

      service.invalidateCacheForUsers(['user-1', 'user-2']);

      await service.getPermissionsWithVersion('user-1');
      await service.getPermissionsWithVersion('user-2');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(4);
    });

    it('handles an empty list without error', () => {
      expect(() => service.invalidateCacheForUsers([])).not.toThrow();
    });
  });

  describe('invalidateRoleCache', () => {
    it('looks up users assigned to the role and invalidates their cache entries', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
      ] as unknown as User[]);
      prisma.user.findUnique.mockResolvedValue({
        role: 'STAFF',
        roleId: 'role-9',
        permissionsVersion: 1,
      } as unknown as User);
      prisma.rolePermission.findMany.mockResolvedValue(
        [] as unknown as RolePermission[],
      );

      await service.getPermissionsWithVersion('user-1'); // populate cache
      await service.invalidateRoleCache('role-9');
      await service.getPermissionsWithVersion('user-1'); // should re-fetch

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { roleId: 'role-9' },
        select: { id: true },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.findUnique).toHaveBeenCalledTimes(2);
    });
  });
});
