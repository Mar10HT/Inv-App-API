import { Controller, Post, ForbiddenException, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsSeedService } from './permissions-seed.service';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions } from '../auth/decorators';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Controller('seed')
export class SeedController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionsSeed: PermissionsSeedService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings:edit')
  async runSeed() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Seed endpoint is disabled in production');
    }

    try {
      // Seed admin user if not present
      const existingAdmin = await this.prisma.user.findUnique({
        where: { email: 'admin@example.com' },
      });

      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash('password123', 10);
        await this.prisma.user.create({
          data: {
            email: 'admin@example.com',
            password: hashedPassword,
            name: 'System Administrator',
            role: UserRole.SYSTEM_ADMIN,
          },
        });
      }

      // Run RBAC permissions seed (idempotent)
      const rbacResult = await this.permissionsSeed.run();

      return {
        success: true,
        message: 'Seed completed successfully.',
        adminCreated: !existingAdmin,
        rbac: rbacResult,
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /** Dedicated endpoint for running only the RBAC seed (safe to run in dev anytime). */
  @Post('permissions')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('settings:edit')
  async runPermissionsSeed() {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Seed endpoint is disabled in production');
    }

    try {
      const result = await this.permissionsSeed.run();
      return { success: true, ...result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}
