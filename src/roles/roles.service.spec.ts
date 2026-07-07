import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: any;
  let permissionsService: any;

  const mockRoleListItem = {
    id: 'role-1',
    name: 'manager',
    displayName: 'Manager',
    description: 'Manages things',
    isSystem: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    _count: { permissions: 2, users: 3 },
  };

  const mockRoleFindOne = {
    id: 'role-1',
    name: 'manager',
    displayName: 'Manager',
    description: 'Manages things',
    isSystem: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    _count: { users: 3 },
    permissions: [
      {
        permission: {
          id: 'perm-1',
          key: 'inventory:view',
          module: 'inventory',
          action: 'view',
          description: 'View inventory',
        },
      },
    ],
  };

  const mockRoleForUpdate = {
    id: 'role-1',
    name: 'manager',
    displayName: 'Manager',
    description: 'Manages things',
    isSystem: false,
    permissions: [{ permissionId: 'perm-1' }],
  };

  const mockRoleForRemove = {
    id: 'role-1',
    name: 'manager',
    displayName: 'Manager',
    description: 'Manages things',
    isSystem: false,
    _count: { users: 0 },
  };

  beforeEach(async () => {
    prisma = {
      role: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      permission: {
        findMany: jest.fn(),
      },
      rolePermission: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn((cb: (tx: any) => any) => cb(prisma)),
    };

    permissionsService = {
      invalidateCacheForUsers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: PrismaService, useValue: prisma },
        { provide: PermissionsService, useValue: permissionsService },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn().mockResolvedValue(undefined),
            logSafe: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RolesService>(RolesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findAll', () => {
    it('returns roles mapped with permission and user counts', async () => {
      prisma.role.findMany.mockResolvedValue([mockRoleListItem]);

      const result = await service.findAll();

      expect(result).toEqual([
        {
          id: 'role-1',
          name: 'manager',
          displayName: 'Manager',
          description: 'Manages things',
          isSystem: false,
          permissionCount: 2,
          userCount: 3,
          createdAt: mockRoleListItem.createdAt,
          updatedAt: mockRoleListItem.updatedAt,
        },
      ]);
      expect(prisma.role.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { name: 'asc' } }),
      );
    });
  });

  describe('findOne', () => {
    it('returns the role with mapped permissions', async () => {
      prisma.role.findUnique.mockResolvedValue(mockRoleFindOne);

      const result = await service.findOne('role-1');

      expect(result).toEqual({
        id: 'role-1',
        name: 'manager',
        displayName: 'Manager',
        description: 'Manages things',
        isSystem: false,
        userCount: 3,
        permissions: [
          {
            id: 'perm-1',
            key: 'inventory:view',
            module: 'inventory',
            action: 'view',
            description: 'View inventory',
          },
        ],
        createdAt: mockRoleFindOne.createdAt,
        updatedAt: mockRoleFindOne.updatedAt,
      });
    });

    it('throws NotFoundException when the role does not exist', async () => {
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    const baseDto = () => ({
      name: 'manager',
      displayName: 'Manager',
      description: 'Manages things',
      permissionIds: ['perm-1'],
    });

    it('creates a role and returns it via findOne', async () => {
      prisma.role.findUnique
        .mockResolvedValueOnce(null) // duplicate-name check
        .mockResolvedValueOnce(mockRoleFindOne); // findOne() at the end
      prisma.permission.findMany.mockResolvedValue([{ id: 'perm-1' }]);
      prisma.role.create.mockResolvedValue({ id: 'role-1', name: 'manager' });

      const result = await service.create(baseDto() as any, 'actor-1');

      expect(result).toEqual(
        expect.objectContaining({ id: 'role-1', name: 'manager' }),
      );
      expect(prisma.role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'manager',
            displayName: 'Manager',
            isSystem: false,
            permissions: { create: [{ permissionId: 'perm-1' }] },
          }),
        }),
      );
    });

    it('creates a role without permissionIds', async () => {
      prisma.role.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(mockRoleFindOne);
      prisma.role.create.mockResolvedValue({ id: 'role-1', name: 'manager' });

      await service.create(
        { name: 'manager', displayName: 'Manager' } as any,
        'actor-1',
      );

      expect(prisma.permission.findMany).not.toHaveBeenCalled();
      expect(prisma.role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.not.objectContaining({ permissions: expect.anything() }),
        }),
      );
    });

    it('throws ConflictException when the role name is already taken', async () => {
      prisma.role.findUnique.mockResolvedValueOnce({
        id: 'existing',
        name: 'manager',
      });

      await expect(service.create(baseDto() as any, 'actor-1')).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.role.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a permissionId does not exist', async () => {
      prisma.role.findUnique.mockResolvedValueOnce(null);
      prisma.permission.findMany.mockResolvedValue([]); // none found

      await expect(service.create(baseDto() as any, 'actor-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.role.create).not.toHaveBeenCalled();
    });

    it('translates a race-condition P2002 error into ConflictException', async () => {
      prisma.role.findUnique.mockResolvedValueOnce(null);
      prisma.permission.findMany.mockResolvedValue([{ id: 'perm-1' }]);
      prisma.role.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.create(baseDto() as any, 'actor-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rethrows unrelated errors from role.create', async () => {
      prisma.role.findUnique.mockResolvedValueOnce(null);
      prisma.permission.findMany.mockResolvedValue([{ id: 'perm-1' }]);
      const unexpected = new Error('db down');
      prisma.role.create.mockRejectedValue(unexpected);

      await expect(service.create(baseDto() as any, 'actor-1')).rejects.toThrow(
        'db down',
      );
    });
  });

  describe('update', () => {
    const dto = () => ({
      displayName: 'Manager 2',
      description: 'Updated',
      permissionIds: ['perm-2'],
    });

    it('updates fields, replaces permissions and invalidates affected users', async () => {
      prisma.role.findUnique
        .mockResolvedValueOnce(mockRoleForUpdate) // initial lookup
        .mockResolvedValueOnce(mockRoleFindOne); // findOne() at the end
      prisma.permission.findMany.mockResolvedValue([{ id: 'perm-2' }]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
      ]);

      const result = await service.update('role-1', dto() as any, 'actor-1');

      expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1' },
      });
      expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [{ roleId: 'role-1', permissionId: 'perm-2' }],
      });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1' },
        data: { permissionsVersion: { increment: 1 } },
      });
      expect(permissionsService.invalidateCacheForUsers).toHaveBeenCalledWith([
        'user-1',
        'user-2',
      ]);
      expect(result).toEqual(
        expect.objectContaining({ id: 'role-1', name: 'manager' }),
      );
    });

    it('updates display fields only when permissionIds is not provided', async () => {
      prisma.role.findUnique
        .mockResolvedValueOnce(mockRoleForUpdate)
        .mockResolvedValueOnce(mockRoleFindOne);

      await service.update(
        'role-1',
        { displayName: 'Only name' } as any,
        'actor-1',
      );

      expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(permissionsService.invalidateCacheForUsers).not.toHaveBeenCalled();
    });

    it('clears all permissions when permissionIds is an empty array', async () => {
      prisma.role.findUnique
        .mockResolvedValueOnce(mockRoleForUpdate)
        .mockResolvedValueOnce(mockRoleFindOne);
      prisma.user.findMany.mockResolvedValue([]);

      await service.update('role-1', { permissionIds: [] } as any, 'actor-1');

      expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1' },
      });
      expect(prisma.rolePermission.createMany).not.toHaveBeenCalled();
      expect(permissionsService.invalidateCacheForUsers).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the role does not exist', async () => {
      prisma.role.findUnique.mockResolvedValueOnce(null);

      await expect(
        service.update('missing', dto() as any, 'actor-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when modifying permissions on a system role', async () => {
      prisma.role.findUnique.mockResolvedValueOnce({
        ...mockRoleForUpdate,
        isSystem: true,
      });

      await expect(
        service.update('role-1', dto() as any, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when a permissionId is invalid', async () => {
      prisma.role.findUnique.mockResolvedValueOnce(mockRoleForUpdate);
      prisma.permission.findMany.mockResolvedValue([]);

      await expect(
        service.update('role-1', dto() as any, 'actor-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('deletes a role with no assigned users', async () => {
      prisma.role.findUnique.mockResolvedValue(mockRoleForRemove);
      prisma.role.delete.mockResolvedValue(mockRoleForRemove);

      const result = await service.remove('role-1', 'actor-1');

      expect(prisma.role.delete).toHaveBeenCalledWith({
        where: { id: 'role-1' },
      });
      expect(result).toEqual({ message: "Role 'manager' deleted" });
    });

    it('throws NotFoundException when the role does not exist', async () => {
      prisma.role.findUnique.mockResolvedValue(null);

      await expect(service.remove('missing', 'actor-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when the role is a system role', async () => {
      prisma.role.findUnique.mockResolvedValue({
        ...mockRoleForRemove,
        isSystem: true,
      });

      await expect(service.remove('role-1', 'actor-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when users are still assigned', async () => {
      prisma.role.findUnique.mockResolvedValue({
        ...mockRoleForRemove,
        _count: { users: 5 },
      });

      await expect(service.remove('role-1', 'actor-1')).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.role.delete).not.toHaveBeenCalled();
    });
  });

  describe('getAllPermissions', () => {
    it('groups permissions by module', async () => {
      prisma.permission.findMany.mockResolvedValue([
        {
          id: 'perm-1',
          key: 'inventory:view',
          module: 'inventory',
          action: 'view',
          description: 'View inventory',
        },
        {
          id: 'perm-2',
          key: 'inventory:create',
          module: 'inventory',
          action: 'create',
          description: 'Create inventory',
        },
        {
          id: 'perm-3',
          key: 'users:view',
          module: 'users',
          action: 'view',
          description: 'View users',
        },
      ]);

      const result = await service.getAllPermissions();

      expect(result).toEqual([
        {
          module: 'inventory',
          permissions: [
            {
              id: 'perm-1',
              key: 'inventory:view',
              action: 'view',
              description: 'View inventory',
            },
            {
              id: 'perm-2',
              key: 'inventory:create',
              action: 'create',
              description: 'Create inventory',
            },
          ],
        },
        {
          module: 'users',
          permissions: [
            {
              id: 'perm-3',
              key: 'users:view',
              action: 'view',
              description: 'View users',
            },
          ],
        },
      ]);
    });

    it('returns an empty array when there are no permissions', async () => {
      prisma.permission.findMany.mockResolvedValue([]);

      const result = await service.getAllPermissions();

      expect(result).toEqual([]);
    });
  });
});
