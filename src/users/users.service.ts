import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto, PaginatedResult, parsePagination, buildPaginationMeta, parseSortOrder } from '../common/dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private auditService: AuditService,
  ) {}

  /**
   * Snapshot of a user safe to embed in audit changes. Strips password,
   * roleId, and any other field we don't want to materialize in the audit
   * log. Used by create/update/remove instrumentation below.
   */
  private auditSnapshot(user: Record<string, unknown> | null) {
    if (!user) return undefined;
    return {
      email: user['email'],
      name: user['name'],
      role: user['role'],
      roleId: user['roleId'],
    };
  }

  private readonly userSelect = {
    id: true,
    email: true,
    name: true,
    role: true,
    roleId: true,
    createdAt: true,
    updatedAt: true,
    // Exclude password
  };

  async create(createUserDto: CreateUserDto, actorUserId?: string) {
    try {
      // Check for existing active user with same email (soft-delete safe)
      const existingActive = await this.prisma.user.findFirst({
        where: { email: createUserDto.email, deletedAt: null },
        select: { id: true },
      });
      if (existingActive) {
        throw new ConflictException('User with this email already exists');
      }

      // Hash password before storing
      const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

      const { roleId, ...rest } = createUserDto;

      if (roleId) {
        const roleExists = await this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
        if (!roleExists) throw new BadRequestException(`Role '${roleId}' not found`);
      }

      const user = await this.prisma.user.create({
        data: {
          ...rest,
          password: hashedPassword,
          // Wire up RBAC role when provided
          ...(roleId ? { roleId } : {}),
        },
      });

      // Send welcome email (fire-and-forget)
      this.emailService.sendWelcomeEmail(user.email, user.name || undefined).catch(() => {});

      this.auditService.logSafe({
        action: 'CREATE',
        entity: 'User',
        entityId: user.id,
        userId: actorUserId,
        changes: { after: this.auditSnapshot(user) },
      });

      // Remove password from response
      const { password, ...result } = user;
      return result;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('User with this email already exists');
      }
      throw error;
    }
  }

  async findAll(pagination?: PaginationDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = parsePagination(pagination);

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: parseSortOrder(pagination?.sortOrder) },
        select: this.userSelect,
      }),
      this.prisma.user.count({ where: { deletedAt: null } }),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleId: true,
        createdAt: true,
        updatedAt: true,
        // Exclude password
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto, actorUserId?: string) {
    if (updateUserDto.role === 'SYSTEM_ADMIN') {
      throw new BadRequestException('Cannot assign SYSTEM_ADMIN role through this endpoint');
    }

    if (updateUserDto.roleId) {
      const targetRole = await this.prisma.role.findUnique({
        where: { id: updateUserDto.roleId },
        select: { id: true, name: true },
      });
      if (!targetRole) throw new BadRequestException(`Role '${updateUserDto.roleId}' not found`);
      if (targetRole.name === 'SYSTEM_ADMIN') {
        throw new BadRequestException('Cannot assign SYSTEM_ADMIN role through this endpoint');
      }
    }

    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true, name: true, role: true, roleId: true },
    });

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: updateUserDto,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          roleId: true,
          createdAt: true,
          updatedAt: true,
          // Exclude password
        },
      });

      this.auditService.logSafe({
        action: 'UPDATE',
        entity: 'User',
        entityId: id,
        userId: actorUserId,
        changes: {
          before: this.auditSnapshot(before),
          after: this.auditSnapshot(user),
          fields: Object.keys(updateUserDto),
        },
      });

      return user;
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') throw new ConflictException('User with this email already exists');
        if (error.code === 'P2025') throw new NotFoundException(`User with ID ${id} not found`);
      }
      throw error;
    }
  }

  async remove(id: string, actorUserId?: string) {
    const before = await this.prisma.user.findUnique({
      where: { id },
      select: { email: true, name: true, role: true, roleId: true },
    });

    try {
      // Soft delete: set deletedAt timestamp instead of hard delete
      await this.prisma.user.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`User with ID ${id} not found`);
      }
      throw error;
    }

    this.auditService.logSafe({
      action: 'DELETE',
      entity: 'User',
      entityId: id,
      userId: actorUserId,
      changes: { before: this.auditSnapshot(before) },
    });
  }

  async restore(id: string, actorUserId?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (!user.deletedAt) {
      throw new ConflictException('User is not deleted');
    }

    const restored = await this.prisma.user.update({
      where: { id },
      data: { deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    this.auditService.logSafe({
      action: 'RESTORE',
      entity: 'User',
      entityId: id,
      userId: actorUserId,
      changes: { after: this.auditSnapshot(restored) },
    });

    return restored;
  }

  // Notification preferences
  async getPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        emailNotifications: true,
        lowStockAlerts: true,
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    return user;
  }

  async updatePreferences(userId: string, prefs: { emailNotifications?: boolean; lowStockAlerts?: boolean }) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: prefs,
        select: {
          emailNotifications: true,
          lowStockAlerts: true,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }
      throw error;
    }
  }

  // Method to find user by email (for auth).
  // INTENTIONALLY includes password so AuthService can run bcrypt.compare().
  // This is the only method that returns the hash — all other read paths use userSelect.
  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleId: true,
        createdAt: true,
        updatedAt: true,
        password: true, // Required for authentication — do NOT remove
      },
    });
  }

  // Method to find user with password (for password change)
  async findOneWithPassword(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        password: true,
      },
    });
  }

  // Method to update password only
  async updatePassword(id: string, hashedPassword: string) {
    return this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
      select: {
        id: true,
        email: true,
      },
    });
  }

  async updatePushToken(userId: string, token: string | null): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        // If registering a new token, atomically clear it from any other user first
        // (handles device transfers and app reinstalls)
        if (token !== null) {
          await tx.user.updateMany({
            where: { expoPushToken: token, NOT: { id: userId } },
            data: { expoPushToken: null },
          });
        }
        await tx.user.update({
          where: { id: userId },
          data: { expoPushToken: token },
        });
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`User with ID ${userId} not found`);
      }
      throw error;
    }
  }
}
