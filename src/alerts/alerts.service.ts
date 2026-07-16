import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EventsService } from '../events/events.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { AlertType, InventoryStatus } from '@prisma/client';
import {
  PaginationDto,
  parsePagination,
  buildPaginationMeta,
} from '../common/dto';

const ALERT_PUSH_TITLE: Record<AlertType, string> = {
  LOW_STOCK: '⚠️ Stock bajo',
  OUT_OF_STOCK: '🔴 Sin stock',
  EXPIRING_SOON: '⏰ Por vencer',
};

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  // In-process lock to prevent overlapping cron runs on the same instance.
  private isCheckRunning = false;

  constructor(
    private prisma: PrismaService,
    private eventsService: EventsService,
    private pushNotifications: PushNotificationsService,
  ) {}

  // Run every 6 hours to check for low stock
  @Cron(CronExpression.EVERY_6_HOURS)
  async checkLowStock() {
    if (this.isCheckRunning) {
      this.logger.warn('Low stock check already running, skipping...');
      return;
    }
    this.isCheckRunning = true;

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

      // Pre-load all unresolved alerts for these items in one query to avoid N+1
      const existingStockAlerts = await this.prisma.stockAlert.findMany({
        where: {
          itemId: { in: lowStockItems.map((i) => i.id) },
          resolvedAt: null,
        },
        select: { id: true, itemId: true, type: true },
      });
      // Keep first occurrence per itemId — guards against duplicate unresolved alerts in DB
      const existingStockAlertByItemId = new Map<
        string,
        (typeof existingStockAlerts)[0]
      >();
      for (const a of existingStockAlerts) {
        if (!existingStockAlertByItemId.has(a.itemId)) {
          existingStockAlertByItemId.set(a.itemId, a);
        }
      }

      for (const item of lowStockItems) {
        // Check if there's already an unresolved alert for this item
        const existingAlert = existingStockAlertByItemId.get(item.id);

        if (!existingAlert) {
          // Create new alert
          const alertType =
            item.quantity === 0 ? AlertType.OUT_OF_STOCK : AlertType.LOW_STOCK;

          const newAlert = await this.prisma.stockAlert.create({
            data: {
              itemId: item.id,
              type: alertType,
              threshold: item.minQuantity,
              currentQty: item.quantity,
              notified: true,
              notifiedAt: new Date(),
            },
          });

          this.eventsService.emitAlertChange('created', newAlert.id, {
            type: alertType,
            itemName: item.name,
          });
          alertsCreated++;
          this.logger.log(
            `Alert created for item ${item.name} (${item.id}): ${alertType}`,
          );

          // Send push notification (fire-and-forget)
          this.sendAlertPushNotification(
            alertType,
            item.id,
            item.warehouseId,
            item.name,
            item.warehouse?.name,
          ).catch((err) =>
            this.logger.error('Failed to send alert push notification', err),
          );
        } else if (
          existingAlert.type !== AlertType.OUT_OF_STOCK &&
          item.quantity === 0
        ) {
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

      // Check for expiring items (within 7 days)
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

      const expiringItems = await this.prisma.inventoryItem.findMany({
        where: {
          deletedAt: null,
          expirationDate: {
            not: null,
            lte: sevenDaysFromNow,
            gt: new Date(), // Not yet expired
          },
        },
        include: {
          warehouse: true,
        },
      });

      // Pre-load all unresolved EXPIRING_SOON alerts for these items in one query
      const existingExpiryAlerts = await this.prisma.stockAlert.findMany({
        where: {
          itemId: { in: expiringItems.map((i) => i.id) },
          type: AlertType.EXPIRING_SOON,
          resolvedAt: null,
        },
        select: { id: true, itemId: true },
      });
      const existingExpiryAlertItemIds = new Set(
        existingExpiryAlerts.map((a) => a.itemId),
      );

      for (const item of expiringItems) {
        // Check if there's already an unresolved EXPIRING_SOON alert
        const existingAlert = existingExpiryAlertItemIds.has(item.id);

        if (!existingAlert) {
          await this.prisma.stockAlert.create({
            data: {
              itemId: item.id,
              type: AlertType.EXPIRING_SOON,
              threshold: item.minQuantity,
              currentQty: item.quantity,
              notified: true,
              notifiedAt: new Date(),
            },
          });

          alertsCreated++;
          this.logger.log(
            `Expiring soon alert created for item ${item.name} (${item.id})`,
          );

          this.sendAlertPushNotification(
            AlertType.EXPIRING_SOON,
            item.id,
            item.warehouseId,
            item.name,
            item.warehouse?.name,
          ).catch((err) =>
            this.logger.error(
              'Failed to send expiring soon push notification',
              err,
            ),
          );
        }
      }

      // Resolve alerts for items that are now in stock or in use
      const resolvedAlerts = await this.prisma.stockAlert.updateMany({
        where: {
          resolvedAt: null,
          item: {
            status: { in: [InventoryStatus.IN_STOCK, InventoryStatus.IN_USE] },
          },
        },
        data: {
          resolvedAt: new Date(),
        },
      });

      if (resolvedAlerts.count > 0) {
        this.eventsService.emitAlertChange('bulk_updated', undefined, {
          resolved: resolvedAlerts.count,
        });
      }

      this.logger.log(
        `Low stock check complete. Created: ${alertsCreated}, Resolved: ${resolvedAlerts.count}`,
      );
    } catch (error) {
      this.logger.error('Error during low stock check:', error);
    } finally {
      this.isCheckRunning = false;
    }
  }

  async findAll(pagination?: PaginationDto) {
    const { page, limit, skip } = parsePagination(pagination);
    const alertInclude = { item: { include: { warehouse: true } } };

    const [alerts, total] = await Promise.all([
      this.prisma.stockAlert.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: alertInclude,
      }),
      this.prisma.stockAlert.count(),
    ]);

    return { data: alerts, meta: buildPaginationMeta(total, page, limit) };
  }

  async findActive(pagination?: PaginationDto) {
    const { page, limit, skip } = parsePagination(pagination);
    const where = { resolvedAt: null };
    const alertInclude = { item: { include: { warehouse: true } } };

    const [alerts, total] = await Promise.all([
      this.prisma.stockAlert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: alertInclude,
      }),
      this.prisma.stockAlert.count({ where }),
    ]);

    return { data: alerts, meta: buildPaginationMeta(total, page, limit) };
  }

  async findByType(type: AlertType, pagination?: PaginationDto) {
    const { page, limit, skip } = parsePagination(pagination);
    const where = { type, resolvedAt: null };
    const alertInclude = { item: { include: { warehouse: true } } };

    const [alerts, total] = await Promise.all([
      this.prisma.stockAlert.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: alertInclude,
      }),
      this.prisma.stockAlert.count({ where }),
    ]);

    return { data: alerts, meta: buildPaginationMeta(total, page, limit) };
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
    await this.findOne(id);

    return this.prisma.stockAlert.update({
      where: { id },
      data: {
        notified: true,
        notifiedAt: new Date(),
      },
    });
  }

  async resolve(id: string) {
    await this.findOne(id);

    const updated = await this.prisma.stockAlert.update({
      where: { id },
      data: {
        resolvedAt: new Date(),
      },
    });

    this.eventsService.emitAlertChange('updated', id, { resolved: true });
    return updated;
  }

  async getStats() {
    const [total, active, lowStock, outOfStock, expiringItems, notified] =
      await Promise.all([
        this.prisma.stockAlert.count(),
        this.prisma.stockAlert.count({ where: { resolvedAt: null } }),
        this.prisma.stockAlert.count({
          where: { type: AlertType.LOW_STOCK, resolvedAt: null },
        }),
        this.prisma.stockAlert.count({
          where: { type: AlertType.OUT_OF_STOCK, resolvedAt: null },
        }),
        this.prisma.stockAlert.count({
          where: { type: AlertType.EXPIRING_SOON, resolvedAt: null },
        }),
        this.prisma.stockAlert.count({
          where: { notified: true, resolvedAt: null },
        }),
      ]);

    return {
      total,
      active,
      resolved: total - active,
      byType: {
        lowStock,
        outOfStock,
        expiringItems,
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

  private async sendAlertPushNotification(
    type: AlertType,
    itemId: string,
    warehouseId: string,
    itemName: string,
    warehouseName?: string,
  ): Promise<void> {
    // Only notify users who have access to the warehouse where the alert originated
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        expoPushToken: { not: null },
        lowStockAlerts: true,
        OR: [
          // Users with unrestricted access (null warehouseIds means all warehouses)
          { warehouseAccess: { none: {} } },
          // Users explicitly granted access to this warehouse
          { warehouseAccess: { some: { warehouseId } } },
        ],
      },
      select: { expoPushToken: true },
    });

    const tokens = users
      .map((u) => u.expoPushToken)
      .filter((t): t is string => t !== null);

    if (tokens.length === 0) return;

    const body = warehouseName ? `${itemName} · ${warehouseName}` : itemName;

    const staleTokens = await this.pushNotifications.send(
      tokens.map((to) => ({
        to,
        title: ALERT_PUSH_TITLE[type],
        body,
        sound: 'default' as const,
        data: { type, itemId, screen: 'alerts' },
      })),
    );

    // Clean up tokens that Expo reported as DeviceNotRegistered
    if (staleTokens.length > 0) {
      await this.prisma.user.updateMany({
        where: { expoPushToken: { in: staleTokens } },
        data: { expoPushToken: null },
      });
      this.logger.log(`Cleared ${staleTokens.length} stale push token(s)`);
    }
  }
}
