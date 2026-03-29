import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../permissions/permissions.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { PERMISSIONS } from '../common/constants/permissions.constant';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /** Returns all roles with permission count and user count. */
  async findAll() {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { permissions: true, users: true },
        },
      },
    });

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      displayName: r.displayName,
      description: r.description,
      isSystem: r.isSystem,
      permissionCount: r._count.permissions,
      userCount: r._count.users,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  /** Returns a single role with full permission list. */
  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: { select: { users: true } },
      },
    });

    if (!role) throw new NotFoundException('Role not found');

    return {
      id: role.id,
      name: role.name,
      displayName: role.displayName,
      description: role.description,
      isSystem: role.isSystem,
      userCount: role._count.users,
      permissions: role.permissions.map((rp) => ({
        id: rp.permission.id,
        key: rp.permission.key,
        module: rp.permission.module,
        action: rp.permission.action,
        description: rp.permission.description,
      })),
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  async create(dto: CreateRoleDto) {
    const existing = await this.prisma.role.findUnique({ where: { name: dto.name } });
    if (existing) throw new ConflictException(`Role name '${dto.name}' is already taken`);

    if (dto.permissionIds?.length) {
      await this.validatePermissionIds(dto.permissionIds);
    }

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        displayName: dto.displayName,
        description: dto.description,
        isSystem: false,
        ...(dto.permissionIds?.length
          ? {
              permissions: {
                create: dto.permissionIds.map((permissionId) => ({ permissionId })),
              },
            }
          : {}),
      },
    }).catch((err: { code?: string }) => {
      // Guard against a race-condition duplicate (P2002 unique constraint)
      if (err.code === 'P2002') throw new ConflictException(`Role name '${dto.name}' is already taken`);
      throw err;
    });

    return this.findOne(role.id);
  }

  async update(id: string, dto: UpdateRoleDto) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');

    if (dto.permissionIds?.length) {
      await this.validatePermissionIds(dto.permissionIds);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(dto.displayName !== undefined ? { displayName: dto.displayName } : {}),
          ...(dto.description !== undefined ? { description: dto.description } : {}),
        },
      });

      // Replace permissions if provided
      if (dto.permissionIds !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });

        if (dto.permissionIds.length > 0) {
          await tx.rolePermission.createMany({
            data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
          });
        }

        // Bump permissionsVersion for all users in this role
        await tx.user.updateMany({
          where: { roleId: id },
          data: { permissionsVersion: { increment: 1 } },
        });
      }
    });

    // Invalidate in-memory permission cache for affected users
    if (dto.permissionIds !== undefined) {
      await this.permissionsService.invalidateRoleCache(id);
    }

    return this.findOne(id);
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });

    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new BadRequestException('System roles cannot be deleted');
    if (role._count.users > 0) {
      throw new BadRequestException(
        `Cannot delete role: ${role._count.users} user(s) are assigned to it`,
      );
    }

    await this.prisma.role.delete({ where: { id } });
    return { message: `Role '${role.name}' deleted` };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /**
   * Throws BadRequestException if any of the supplied permissionIds do not
   * exist in the database. Prevents a Prisma FK error from surfacing as 500.
   */
  private async validatePermissionIds(ids: string[]): Promise<void> {
    // Deduplicate before counting to avoid a false negative when the caller
    // passes the same ID more than once (count returns distinct matches).
    const uniqueIds = [...new Set(ids)];
    const found = await this.prisma.permission.count({
      where: { id: { in: uniqueIds } },
    });

    if (found !== uniqueIds.length) {
      throw new BadRequestException('One or more permission IDs are invalid');
    }
  }

  /**
   * Returns all permissions grouped by module.
   * NOTE: reads from the in-memory PERMISSIONS constant, not the database.
   * If a permission is added to the DB outside the seed, this response will
   * not reflect it until the constant is updated and the app is restarted.
   */
  getAllPermissions() {
    const grouped: Record<string, { key: string; action: string; description: string }[]> = {};

    for (const perm of PERMISSIONS) {
      if (!grouped[perm.module]) grouped[perm.module] = [];
      grouped[perm.module].push({
        key: perm.key,
        action: perm.action,
        description: perm.description,
      });
    }

    return Object.entries(grouped).map(([module, permissions]) => ({
      module,
      permissions,
    }));
  }
}
