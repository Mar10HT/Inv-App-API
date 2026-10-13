import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InventoryStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AlertsService } from './alerts.service';
import { computeInventoryStatus } from '../inventory/inventory-status';

/**
 * Keeps each item's stored status in line with its quantity and raises or
 * resolves stock alerts.
 *
 * Sales, purchases, outflows, transfers, stock takes and manual transactions
 * change quantities directly, so they call scheduleRefresh() once their
 * transaction commits. Calls that arrive close together are coalesced into a
 * single refresh.
 */
@Injectable()
export class StockLevelService implements OnApplicationBootstrap {
  static readonly DEBOUNCE_MS = 500;

  private readonly logger = new Logger(StockLevelService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private rerunRequested = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertsService: AlertsService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  onApplicationBootstrap(): void {
    // Repairs statuses left stale before this service existed, and makes the
    // alert bell accurate right after a restart instead of up to 6 hours later.
    void this.refreshNow();
  }

  scheduleRefresh(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refreshNow();
    }, StockLevelService.DEBOUNCE_MS);
  }

  // Safety net for anything that changes stock without calling scheduleRefresh().
  @Cron(CronExpression.EVERY_6_HOURS)
  async refreshNow(): Promise<void> {
    if (this.running) {
      this.rerunRequested = true;
      return this.running;
    }

    this.running = this.refresh();
    try {
      await this.running;
    } finally {
      this.running = null;
      if (this.rerunRequested) {
        this.rerunRequested = false;
        this.scheduleRefresh();
      }
    }
  }

  async syncStatuses(): Promise<number> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        itemType: true,
        quantity: true,
        minQuantity: true,
        assignedToUserId: true,
        status: true,
      },
    });

    const idsByStatus = new Map<InventoryStatus, string[]>();
    for (const item of items) {
      const status = computeInventoryStatus(item);
      if (status === item.status) continue;
      const ids = idsByStatus.get(status) ?? [];
      ids.push(item.id);
      idsByStatus.set(status, ids);
    }

    let updated = 0;
    for (const [status, ids] of idsByStatus) {
      const result = await this.prisma.inventoryItem.updateMany({
        where: { id: { in: ids } },
        data: { status },
      });
      updated += result.count;
    }
    return updated;
  }

  private async refresh(): Promise<void> {
    try {
      const updated = await this.syncStatuses();
      if (updated > 0) {
        this.logger.log(`Updated stock status of ${updated} item(s)`);
      }
      await this.alertsService.checkLowStock();
      // Dashboard stats are cached; quantities just changed.
      await this.cacheManager.clear();
    } catch (error) {
      this.logger.error('Stock level refresh failed', error);
    }
  }
}
