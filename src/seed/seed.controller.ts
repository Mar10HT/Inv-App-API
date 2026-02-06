import { Controller, Post } from '@nestjs/common';
import { PrismaClient, InventoryStatus, Currency, ItemType, UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Controller('seed')
export class SeedController {
  private prisma = new PrismaClient();

  @Post()
  async runSeed() {
    try {
      // Check if admin user already exists
      const existingAdmin = await this.prisma.user.findUnique({
        where: { email: 'admin@example.com' }
      });

      if (existingAdmin) {
        return {
          success: false,
          message: 'Admin user already exists',
          credentials: {
            email: 'admin@example.com',
            password: 'password123'
          }
        };
      }

      // Create admin user only
      const hashedPassword = await bcrypt.hash('password123', 10);
      const adminUser = await this.prisma.user.create({
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
        credentials: {
          email: 'admin@example.com',
          password: 'password123'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}
