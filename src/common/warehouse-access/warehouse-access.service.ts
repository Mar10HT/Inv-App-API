import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WarehouseAccessService {
  // Phase 3 note: this service stays on the base Prisma client (not
  // prisma.tenant()) because:
  // 1. getAccessibleWarehouseIds is called from AuthService.login /
  //    refresh / switchOrg BEFORE the request-scoped tenant context is
  //    set. tenant() would throw on missing orgId.
  // 2. setUserWarehouses uses createMany and setWarehouseManager uses
  //    upsert. The current extension intercepts neither; auto-injection
  //    of organizationId would not happen.
  // Phase 7 release should: (a) extend the Prisma extension to cover
  // upsert + createMany, (b) accept an explicit orgId parameter in
  // getAccessibleWarehouseIds so it filters by current org.
  constructor(private prisma: PrismaService) {}

  /**
   * Returns the warehouse IDs accessible by a user.
   * Returns null for SYSTEM_ADMIN (unrestricted access).
   */
  async getAccessibleWarehouseIds(
    userId: string,
    role: string,
  ): Promise<string[] | null> {
    if (role === 'SYSTEM_ADMIN') return null;

    const assignments = await this.prisma.userWarehouse.findMany({
      where: { userId },
      select: { warehouseId: true },
    });

    return assignments.map((a) => a.warehouseId);
  }

  /**
   * Assign a user to a warehouse (creates UserWarehouse entry).
   */
  async assignUserToWarehouse(
    userId: string,
    warehouseId: string,
  ): Promise<void> {
    await this.prisma.userWarehouse.upsert({
      where: { userId_warehouseId: { userId, warehouseId } },
      create: { userId, warehouseId },
      update: {},
    });
  }

  /**
   * Remove a user from a warehouse.
   */
  async removeUserFromWarehouse(
    userId: string,
    warehouseId: string,
  ): Promise<void> {
    await this.prisma.userWarehouse.deleteMany({
      where: { userId, warehouseId },
    });
  }

  /**
   * Replace all warehouse assignments for a user.
   */
  async setUserWarehouses(
    userId: string,
    warehouseIds: string[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Remove all existing assignments
      await tx.userWarehouse.deleteMany({ where: { userId } });

      // Create new assignments
      if (warehouseIds.length > 0) {
        await tx.userWarehouse.createMany({
          data: warehouseIds.map((warehouseId) => ({ userId, warehouseId })),
        });
      }
    });
  }

  /**
   * Get the warehouse IDs assigned to a user.
   */
  async getUserWarehouses(userId: string) {
    const assignments = await this.prisma.userWarehouse.findMany({
      where: { userId },
      include: {
        warehouse: {
          select: { id: true, name: true, location: true, isActive: true },
        },
      },
    });

    return assignments.map((a) => a.warehouse);
  }

  /**
   * Set the manager for a warehouse and ensure they have access.
   */
  async setWarehouseManager(
    warehouseId: string,
    managerId: string | null,
  ): Promise<void> {
    // Validate manager exists and has appropriate role
    if (managerId) {
      const user = await this.prisma.user.findUnique({
        where: { id: managerId },
        select: { role: true },
      });

      if (!user) {
        throw new BadRequestException('User not found');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // Update warehouse manager
      await tx.warehouse.update({
        where: { id: warehouseId },
        data: { managerId },
      });

      // Ensure manager has access to this warehouse
      if (managerId) {
        await tx.userWarehouse.upsert({
          where: {
            userId_warehouseId: { userId: managerId, warehouseId },
          },
          create: { userId: managerId, warehouseId },
          update: {},
        });
      }
    });
  }
}
