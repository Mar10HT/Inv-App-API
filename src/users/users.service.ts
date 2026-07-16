import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
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

  async create(createUserDto: CreateUserDto) {
    try {
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

  async update(id: string, updateUserDto: UpdateUserDto) {
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

    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: updateUserDto,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          // Exclude password
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

  async remove(id: string) {
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
  }

  async restore(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (!user.deletedAt) {
      throw new ConflictException('User is not deleted');
    }

    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: null },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });
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
    return this.prisma.user.findUnique({
      where: { email },
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

  /**
   * Admin flow: directly set another user's password without the reset-token/email dance.
   * Guarded upstream by @Permissions('users:edit'); adds an in-service safeguard so a
   * non-SYSTEM_ADMIN cannot reset a SYSTEM_ADMIN's password (privilege escalation).
   *
   * Side effects (atomic): sets the new hash, revokes the target's active sessions,
   * invalidates any pending reset tokens, and clears the failed-attempt lockout so the
   * user can log in immediately. Emits a PASSWORD_CHANGE audit entry recording the actor.
   */
  async adminSetPassword(
    targetUserId: string,
    newPassword: string,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, name: true, role: true, deletedAt: true },
    });

    if (!target || target.deletedAt) {
      throw new NotFoundException(`User with ID ${targetUserId} not found`);
    }

    // Prevent privilege escalation: only a SYSTEM_ADMIN may reset a SYSTEM_ADMIN.
    if (target.role === 'SYSTEM_ADMIN' && actor.role !== 'SYSTEM_ADMIN') {
      throw new ForbiddenException(
        'Only a SYSTEM_ADMIN can reset another SYSTEM_ADMIN password',
      );
    }

    // Self password changes must go through the normal change-password flow, which
    // verifies the current password. This admin path is for resetting OTHER users.
    if (targetUserId === actor.userId) {
      throw new ForbiddenException(
        'Use the change-password flow to change your own password',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Atomic: rotate password, kill sessions, void pending resets, clear lockout.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetUserId },
        data: { password: hashedPassword },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: targetUserId, revoked: false },
        data: { revoked: true },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: { userId: targetUserId, used: false },
        data: { used: true },
      }),
      this.prisma.loginAttempt.deleteMany({
        where: { email: target.email.toLowerCase() },
      }),
    ]);

    // Audit who reset whose password (never store the password itself).
    // NOTE: AuditService persists `changes` but not `metadata`, so the context that
    // must survive for post-incident review goes into changes.after.
    await this.auditService.log({
      action: 'PASSWORD_CHANGE',
      entity: 'user',
      entityId: targetUserId,
      userId: actor.userId,
      changes: {
        after: {
          resetByAdmin: true,
          actorEmail: actor.email,
          targetEmail: target.email,
        },
      },
    });

    // Notify the affected user (fire-and-forget).
    this.emailService
      .sendPasswordChangedEmail(target.email, target.name || undefined)
      .catch(() => {});

    return { message: 'Password updated successfully' };
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
