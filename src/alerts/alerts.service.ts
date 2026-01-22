import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AlertType, InventoryStatus } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private prisma: PrismaService) {}

  // Run every 6 hours to check for low stock
  @Cron(CronExpression.EVERY_6_HOURS)
  async checkLowStock() {
    this.logger.log('Running low stock check...');

    try {
      // Find items that are low stock or out of stock
      const lowStockItems = await this.prisma.inventoryItem.findMany({
        where: {
          deletedAt: null,
          OR: [
            { status: InventoryStatus.LOW_STOCK },
            { status: InventoryStatus.OUT_OF_STOCK },
          ],
        },
        include: {
          warehouse: true,
        },
      });

      let alertsCreated = 0;

      for (const item of lowStockItems) {
        // Check if there's already an unresolved alert for this item
        const existingAlert = await this.prisma.stockAlert.findFirst({
          where: {
            itemId: item.id,
            resolvedAt: null,
          },
        });

        if (!existingAlert) {
          // Create new alert
          const alertType = item.quantity === 0
            ? AlertType.OUT_OF_STOCK
            : AlertType.LOW_STOCK;

          await this.prisma.stockAlert.create({
            data: {
              itemId: item.id,
              type: alertType,
              threshold: item.minQuantity,
              currentQty: item.quantity,
            },
          });

          alertsCreated++;
          this.logger.log(`Alert created for item ${item.name} (${item.id}): ${alertType}`);
        } else if (existingAlert.type !== AlertType.OUT_OF_STOCK && item.quantity === 0) {
          // Update existing alert if item went from LOW_STOCK to OUT_OF_STOCK
          await this.prisma.stockAlert.update({
            where: { id: existingAlert.id },
            data: {
              type: AlertType.OUT_OF_STOCK,
              currentQty: 0,
            },
          });
        }
      }

      // Resolve alerts for items that are now in stock
      const resolvedAlerts = await this.prisma.stockAlert.updateMany({
        where: {
          resolvedAt: null,
          item: {
            status: InventoryStatus.IN_STOCK,
          },
        },
        data: {
          resolvedAt: new Date(),
        },
      });

      this.logger.log(`Low stock check complete. Created: ${alertsCreated}, Resolved: ${resolvedAlerts.count}`);
    } catch (error) {
      this.logger.error('Error during low stock check:', error);
    }
  }

  async findAll(pagination?: PaginationDto) {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const [alerts, total] = await Promise.all([
      this.prisma.stockAlert.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          item: {
            include: {
              warehouse: true,
            },
          },
        },
      }),
      this.prisma.stockAlert.count(),
    ]);

    return {
      data: alerts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findActive(pagination?: PaginationDto) {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const where = { resolvedAt: null };

    const [alerts, total] = await Promise.all([
      this.prisma.stockAlert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          item: {
            include: {
              warehouse: true,
            },
          },
        },
      }),
      this.prisma.stockAlert.count({ where }),
    ]);

    return {
      data: alerts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findByType(type: AlertType, pagination?: PaginationDto) {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const where = { type, resolvedAt: null };

    const [alerts, total] = await Promise.all([
      this.prisma.stockAlert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          item: {
            include: {
              warehouse: true,
            },
          },
        },
      }),
      this.prisma.stockAlert.count({ where }),
    ]);

    return {
      data: alerts,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const alert = await this.prisma.stockAlert.findUnique({
      where: { id },
      include: {
        item: {
          include: {
            warehouse: true,
            supplier: true,
          },
        },
      },
    });

    if (!alert) {
      throw new NotFoundException(`Alert with ID ${id} not found`);
    }

    return alert;
  }

  async markAsNotified(id: string) {
    const alert = await this.findOne(id);

    return this.prisma.stockAlert.update({
      where: { id },
      data: {
        notified: true,
        notifiedAt: new Date(),
      },
    });
  }

  async resolve(id: string) {
    const alert = await this.findOne(id);

    return this.prisma.stockAlert.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
      },
    });
  }

  async getStats() {
    const [total, active, lowStock, outOfStock, notified] = await Promise.all([
      this.prisma.stockAlert.count(),
      this.prisma.stockAlert.count({ where: { resolvedAt: null } }),
      this.prisma.stockAlert.count({ where: { type: AlertType.LOW_STOCK, resolvedAt: null } }),
      this.prisma.stockAlert.count({ where: { type: AlertType.OUT_OF_STOCK, resolvedAt: null } }),
      this.prisma.stockAlert.count({ where: { notified: true, resolvedAt: null } }),
    ]);

    return {
      total,
      active,
      resolved: total - active,
      byType: {
        lowStock,
        outOfStock,
      },
      notified,
      pendingNotification: active - notified,
    };
  }

  // Manual trigger for testing or immediate check
  async triggerCheck() {
    await this.checkLowStock();
    return { message: 'Low stock check triggered successfully' };
  }
}
