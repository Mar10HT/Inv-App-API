import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { type Role, type Permission, type User } from '@prisma/client';
import { mockDeep, type DeepMockProxy } from 'jest-mock-extended';
import { RolesService } from './roles.service';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { AuditService } from '../audit/audit.service';

describe('RolesService', () => {
  let service: RolesService;
  let prisma: DeepMockProxy<PrismaService>;
  let permissionsService: jest.Mocked<PermissionsService>;

  // Fixtures deliberately only populate the fields each test actually reads;
  // cast once here (rather than at each mockResolvedValue call site) now that
  // `prisma` is a fully-typed DeepMockProxy<PrismaService>.
  const mockRoleListItem = {
    id: 'role-1',
    name: 'manager',
    displayName: 'Manager',
    description: 'Manages things',
    isSystem: false,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-02'),
    _count: { permissions: 2, users: 3 },
  } as unknown as Role;

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
  } as unknown as Role;

  const mockRoleForUpdate = {
    id: 'role-1',
    name: 'manager',
    displayName: 'Manager',
    description: 'Manages things',
    isSystem: false,
    permissions: [{ permissionId: 'perm-1' }],
  } as unknown as Role;

  const mockRoleForRemove = {
    id: 'role-1',
    name: 'manager',
    displayName: 'Manager',
    description: 'Manages things',
    isSystem: false,
    _count: { users: 0 },
  } as unknown as Role;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    prisma.user.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(((
      cb: (tx: DeepMockProxy<PrismaService>) => unknown,
    ) => cb(prisma)) as never);

    permissionsService = {
      invalidateCacheForUsers: jest.fn(),
    } as unknown as jest.Mocked<PermissionsService>;

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
      // jest-mock-extended's DeepMockProxy methods are real jest.Mock functions
      // at runtime, but their static type doesn't carry that through cleanly
      // enough for this rule to recognize them as safe to reference unbound.
      // eslint-disable-next-line @typescript-eslint/unbound-method
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
      prisma.permission.findMany.mockResolvedValue([
        { id: 'perm-1' },
      ] as unknown as Permission[]);
      prisma.role.create.mockResolvedValue({
        id: 'role-1',
        name: 'manager',
      } as unknown as Role);

      const result = await service.create(baseDto(), 'actor-1');

      expect(result).toEqual(
        expect.objectContaining({ id: 'role-1', name: 'manager' }),
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // jest's expect.objectContaining() return type is `any` in the
          // installed @types/jest — a known, long-standing typing gap.
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
      prisma.role.create.mockResolvedValue({
        id: 'role-1',
        name: 'manager',
      } as unknown as Role);

      await service.create(
        { name: 'manager', displayName: 'Manager' },
        'actor-1',
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.permission.findMany).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.role.create).toHaveBeenCalledWith(
        expect.objectContaining({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          data: expect.not.objectContaining({ permissions: expect.anything() }),
        }),
      );
    });

    it('throws ConflictException when the role name is already taken', async () => {
      prisma.role.findUnique.mockResolvedValueOnce({
        id: 'existing',
        name: 'manager',
      } as unknown as Role);

      await expect(service.create(baseDto(), 'actor-1')).rejects.toThrow(
        ConflictException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.role.create).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when a permissionId does not exist', async () => {
      prisma.role.findUnique.mockResolvedValueOnce(null);
      prisma.permission.findMany.mockResolvedValue([]); // none found

      await expect(service.create(baseDto(), 'actor-1')).rejects.toThrow(
        BadRequestException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.role.create).not.toHaveBeenCalled();
    });

    it('translates a race-condition P2002 error into ConflictException', async () => {
      prisma.role.findUnique.mockResolvedValueOnce(null);
      prisma.permission.findMany.mockResolvedValue([
        { id: 'perm-1' },
      ] as unknown as Permission[]);
      prisma.role.create.mockRejectedValue({ code: 'P2002' });

      await expect(service.create(baseDto(), 'actor-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('rethrows unrelated errors from role.create', async () => {
      prisma.role.findUnique.mockResolvedValueOnce(null);
      prisma.permission.findMany.mockResolvedValue([
        { id: 'perm-1' },
      ] as unknown as Permission[]);
      const unexpected = new Error('db down');
      prisma.role.create.mockRejectedValue(unexpected);

      await expect(service.create(baseDto(), 'actor-1')).rejects.toThrow(
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
      prisma.permission.findMany.mockResolvedValue([
        { id: 'perm-2' },
      ] as unknown as Permission[]);
      prisma.user.findMany.mockResolvedValue([
        { id: 'user-1' },
        { id: 'user-2' },
      ] as unknown as User[]);

      const result = await service.update('role-1', dto(), 'actor-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1' },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.rolePermission.createMany).toHaveBeenCalledWith({
        data: [{ roleId: 'role-1', permissionId: 'perm-2' }],
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1' },
        data: { permissionsVersion: { increment: 1 } },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
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

      await service.update('role-1', { displayName: 'Only name' }, 'actor-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.rolePermission.deleteMany).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(permissionsService.invalidateCacheForUsers).not.toHaveBeenCalled();
    });

    it('clears all permissions when permissionIds is an empty array', async () => {
      prisma.role.findUnique
        .mockResolvedValueOnce(mockRoleForUpdate)
        .mockResolvedValueOnce(mockRoleFindOne);
      prisma.user.findMany.mockResolvedValue([]);

      await service.update('role-1', { permissionIds: [] }, 'actor-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.rolePermission.deleteMany).toHaveBeenCalledWith({
        where: { roleId: 'role-1' },
      });
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(prisma.rolePermission.createMany).not.toHaveBeenCalled();
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(permissionsService.invalidateCacheForUsers).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the role does not exist', async () => {
      prisma.role.findUnique.mockResolvedValueOnce(null);

      await expect(service.update('missing', dto(), 'actor-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when modifying permissions on a system role', async () => {
      prisma.role.findUnique.mockResolvedValueOnce({
        ...mockRoleForUpdate,
        isSystem: true,
      });

      await expect(service.update('role-1', dto(), 'actor-1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when a permissionId is invalid', async () => {
      prisma.role.findUnique.mockResolvedValueOnce(mockRoleForUpdate);
      prisma.permission.findMany.mockResolvedValue([]);

      await expect(service.update('role-1', dto(), 'actor-1')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('deletes a role with no assigned users', async () => {
      prisma.role.findUnique.mockResolvedValue(mockRoleForRemove);
      prisma.role.delete.mockResolvedValue(mockRoleForRemove);

      const result = await service.remove('role-1', 'actor-1');

      // eslint-disable-next-line @typescript-eslint/unbound-method
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
      // eslint-disable-next-line @typescript-eslint/unbound-method
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
      ] as unknown as Permission[]);

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
