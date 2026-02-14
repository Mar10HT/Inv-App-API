import { Controller, Post, ForbiddenException } from '@nestjs/common';
import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Controller('seed')
export class SeedController {
  private prisma = new PrismaClient();

  @Post()
  async runSeed() {
    // Block seed endpoint in production
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Seed endpoint is disabled in production');
    }

    try {
      const existingAdmin = await this.prisma.user.findUnique({
        where: { email: 'admin@example.com' }
      });

      if (existingAdmin) {
        return {
          success: false,
          message: 'Admin user already exists',
        };
      }

      const hashedPassword = await bcrypt.hash('password123', 10);
      await this.prisma.user.create({
        data: {
          email: 'admin@example.com',
          password: hashedPassword,
          name: 'System Administrator',
          role: UserRole.SYSTEM_ADMIN,
        },
      });

      return {
        success: true,
        message: 'Admin user created successfully!',
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
