import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreateStockTakeDto,
  UpdateStockTakeItemDto,
} from './dto/create-stock-take.dto';
import { StockTakeStatus } from '@prisma/client';
import {
  PaginationDto,
  parsePagination,
  buildPaginationMeta,
} from '../common/dto';
import { StockLevelService } from '../alerts/stock-level.service';
import { apiError } from '../common/errors/api-error';
import { lockForUpdate } from '../common/locking';

@Injectable()
export class StockTakeService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private readonly stockLevelService: StockLevelService,
  ) {}

  async create(dto: CreateStockTakeDto, startedById: string) {
    const { stockTake, itemCount } = await this.prisma.$transaction(
      async (tx) => {
        // Two requests starting a count in the same warehouse wait for each
        // other here, so the second one sees the first one's count
        await lockForUpdate(tx, 'warehouses', dto.warehouseId);
        const warehouse = await tx.warehouse.findUnique({
          where: { id: dto.warehouseId },
        });

        if (!warehouse) {
          throw new NotFoundException(
            `Warehouse with ID ${dto.warehouseId} not found`,
          );
        }

        const existing = await tx.stockTake.findFirst({
          where: {
            warehouseId: dto.warehouseId,
            status: StockTakeStatus.IN_PROGRESS,
          },
        });

        if (existing) {
          throw new BadRequestException(
            apiError(
              'STOCK_TAKE_ALREADY_IN_PROGRESS',
              `There is already an in-progress stock take for this warehouse (ID: ${existing.id})`,
              { id: existing.id },
            ),
          );
        }

        // Get all items in the warehouse
        const items = await tx.inventoryItem.findMany({
          where: {
            warehouseId: dto.warehouseId,
            deletedAt: null,
          },
        });

        // Create stock take with all items
        const created = await tx.stockTake.create({
          data: {
            warehouseId: dto.warehouseId,
            startedById,
            notes: dto.notes,
            items: {
              create: items.map((item) => ({
                itemId: item.id,
                expectedQty: item.quantity,
              })),
            },
          },
          include: {
            warehouse: true,
            startedBy: { select: { id: true, name: true, email: true } },
            items: {
              include: {
                item: true,
              },
            },
          },
        });
        return { stockTake: created, itemCount: items.length };
      },
    );

    await this.auditService.log({
      action: 'CREATE',
      entity: 'StockTake',
      entityId: stockTake.id,
      userId: startedById,
      changes: { warehouseId: dto.warehouseId, itemCount },
    });

    return stockTake;
  }

  async findAll(pagination?: PaginationDto, status?: StockTakeStatus) {
    const { page, limit, skip } = parsePagination(pagination);
    const where = status ? { status } : {};

    const [stockTakes, total] = await Promise.all([
      this.prisma.stockTake.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          warehouse: true,
          startedBy: { select: { id: true, name: true, email: true } },
          completedBy: { select: { id: true, name: true, email: true } },
          _count: { select: { items: true } },
        },
      }),
      this.prisma.stockTake.count({ where }),
    ]);

    return { data: stockTakes, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const stockTake = await this.prisma.stockTake.findUnique({
      where: { id },
      include: {
        warehouse: true,
        startedBy: { select: { id: true, name: true, email: true } },
        completedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            item: {
              include: {
                warehouse: true,
              },
            },
          },
          orderBy: { item: { name: 'asc' } },
        },
      },
    });

    if (!stockTake) {
      throw new NotFoundException(`Stock take with ID ${id} not found`);
    }

    return stockTake;
  }

  async updateItem(
    stockTakeId: string,
    dto: UpdateStockTakeItemDto,
    userId: string,
  ) {
    const { updated, stockTakeItem, variance } = await this.prisma.$transaction(
      async (tx) => {
        // A count saved while the stock take is being completed waits here
        // and is then refused, instead of landing after the adjustments
        await lockForUpdate(tx, 'stock_takes', stockTakeId);
        const stockTake = await tx.stockTake.findUnique({
          where: { id: stockTakeId },
          select: { status: true },
        });
        if (!stockTake) {
          throw new NotFoundException(
            `Stock take with ID ${stockTakeId} not found`,
          );
        }

        if (stockTake.status !== StockTakeStatus.IN_PROGRESS) {
          throw new BadRequestException(
            apiError(
              'STOCK_TAKE_NOT_EDITABLE',
              'Cannot update items on a completed or cancelled stock take',
            ),
          );
        }

        const item = await tx.stockTakeItem.findFirst({
          where: {
            stockTakeId,
            itemId: dto.itemId,
          },
        });

        if (!item) {
          throw new NotFoundException(
            `Item ${dto.itemId} not found in this stock take`,
          );
        }

        const itemVariance = dto.countedQty - item.expectedQty;

        const saved = await tx.stockTakeItem.update({
          where: { id: item.id },
          data: {
            countedQty: dto.countedQty,
            variance: itemVariance,
            notes: dto.notes,
            countedAt: new Date(),
          },
          include: {
            item: true,
          },
        });
        return { updated: saved, stockTakeItem: item, variance: itemVariance };
      },
    );

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'StockTakeItem',
      entityId: stockTakeItem.id,
      userId,
      changes: {
        stockTakeId,
        itemId: dto.itemId,
        expectedQty: stockTakeItem.expectedQty,
        countedQty: dto.countedQty,
        variance,
      },
    });

    return updated;
  }

  async complete(
    id: string,
    completedById: string,
    applyChanges: boolean = false,
  ) {
    // Apply inventory changes and mark as COMPLETED in one atomic transaction.
    // The stockTake.update is always the last step inside the transaction so that
    // the status only changes if all preceding writes succeed.
    const { updated, stockTake } = await this.prisma.$transaction(
      async (tx) => {
        // A second complete, or a cancel, of the same stock take waits here
        // and then sees it is no longer in progress: the adjustments are
        // applied once, and never to a cancelled count
        await lockForUpdate(tx, 'stock_takes', id);
        const current = await tx.stockTake.findUnique({
          where: { id },
          include: { items: true },
        });
        if (!current) {
          throw new NotFoundException(`Stock take with ID ${id} not found`);
        }

        if (current.status !== StockTakeStatus.IN_PROGRESS) {
          throw new BadRequestException(
            apiError(
              'STOCK_TAKE_NOT_IN_PROGRESS',
              'Stock take is not in progress',
            ),
          );
        }

        // Check if all items have been counted
        const uncountedItems = current.items.filter(
          (item) => item.countedQty === null,
        );
        if (uncountedItems.length > 0) {
          throw new BadRequestException(
            apiError(
              'STOCK_TAKE_ITEMS_NOT_COUNTED',
              `${uncountedItems.length} items have not been counted yet`,
              { count: uncountedItems.length },
            ),
          );
        }

        if (applyChanges) {
          for (const stockItem of current.items) {
            if (stockItem.variance !== 0 && stockItem.countedQty !== null) {
              await tx.inventoryItem.update({
                where: { id: stockItem.itemId },
                data: {
                  quantity: stockItem.countedQty,
                },
              });
            }
          }
        }

        const completed = await tx.stockTake.update({
          where: { id },
          data: {
            status: StockTakeStatus.COMPLETED,
            completedById,
            completedAt: new Date(),
            adjustmentsApplied: applyChanges,
          },
          include: {
            warehouse: true,
            startedBy: { select: { id: true, name: true, email: true } },
            completedBy: { select: { id: true, name: true, email: true } },
            items: {
              include: { item: true },
            },
          },
        });
        return { updated: completed, stockTake: current };
      },
    );

    // Audit logs are non-critical and run outside the transaction intentionally
    if (applyChanges) {
      for (const stockItem of stockTake.items) {
        if (stockItem.variance !== 0 && stockItem.countedQty !== null) {
          await this.auditService.log({
            action: 'UPDATE',
            entity: 'InventoryItem',
            entityId: stockItem.itemId,
            userId: completedById,
            changes: {
              source: 'StockTake',
              stockTakeId: id,
              previousQty: stockItem.expectedQty,
              newQty: stockItem.countedQty,
              variance: stockItem.variance,
            },
          });
        }
      }
    }

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'StockTake',
      entityId: id,
      userId: completedById,
      changes: { status: 'COMPLETED', changesApplied: applyChanges },
    });

    this.stockLevelService.scheduleRefresh();
    return updated;
  }

  async cancel(id: string, cancelledById: string) {
    const updated = await this.prisma.$transaction(async (tx) => {
      // Waits for a complete of the same stock take running at the same time
      await lockForUpdate(tx, 'stock_takes', id);
      const stockTake = await tx.stockTake.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!stockTake) {
        throw new NotFoundException(`Stock take with ID ${id} not found`);
      }

      if (stockTake.status === StockTakeStatus.COMPLETED) {
        throw new BadRequestException(
          apiError(
            'STOCK_TAKE_ALREADY_COMPLETED',
            'Cannot cancel a completed stock take',
          ),
        );
      }

      return tx.stockTake.update({
        where: { id },
        data: {
          status: StockTakeStatus.CANCELLED,
        },
        include: {
          warehouse: true,
          startedBy: { select: { id: true, name: true, email: true } },
        },
      });
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'StockTake',
      entityId: id,
      userId: cancelledById,
      changes: { status: 'CANCELLED' },
    });

    return updated;
  }

  async getVarianceReport(id: string) {
    const stockTake = await this.findOne(id);

    const itemsWithVariance = stockTake.items.filter(
      (item) => item.variance !== null && item.variance !== 0,
    );

    const summary = {
      totalItems: stockTake.items.length,
      countedItems: stockTake.items.filter((i) => i.countedQty !== null).length,
      itemsWithVariance: itemsWithVariance.length,
      positiveVariance: itemsWithVariance.filter((i) => (i.variance || 0) > 0)
        .length,
      negativeVariance: itemsWithVariance.filter((i) => (i.variance || 0) < 0)
        .length,
      totalPositiveVariance: itemsWithVariance
        .filter((i) => (i.variance || 0) > 0)
        .reduce((sum, i) => sum + (i.variance || 0), 0),
      totalNegativeVariance: itemsWithVariance
        .filter((i) => (i.variance || 0) < 0)
        .reduce((sum, i) => sum + (i.variance || 0), 0),
    };

    return {
      stockTake: {
        id: stockTake.id,
        warehouse: stockTake.warehouse,
        status: stockTake.status,
        startedAt: stockTake.startedAt,
        completedAt: stockTake.completedAt,
      },
      summary,
      items: itemsWithVariance.map((item) => ({
        id: item.id,
        itemId: item.itemId,
        itemName: item.item.name,
        category: item.item.category,
        expectedQty: item.expectedQty,
        countedQty: item.countedQty,
        variance: item.variance,
        notes: item.notes,
      })),
    };
  }

  async getStats() {
    const [total, inProgress, completed, cancelled] = await Promise.all([
      this.prisma.stockTake.count(),
      this.prisma.stockTake.count({
        where: { status: StockTakeStatus.IN_PROGRESS },
      }),
      this.prisma.stockTake.count({
        where: { status: StockTakeStatus.COMPLETED },
      }),
      this.prisma.stockTake.count({
        where: { status: StockTakeStatus.CANCELLED },
      }),
    ]);

    // Get recent stock takes with variances
    const recentWithVariances = await this.prisma.stockTake.findMany({
      where: { status: StockTakeStatus.COMPLETED },
      take: 5,
      orderBy: { completedAt: 'desc' },
      include: {
        warehouse: true,
        items: {
          where: {
            variance: { not: 0 },
          },
        },
      },
    });

    return {
      total,
      byStatus: {
        inProgress,
        completed,
        cancelled,
      },
      recentCompleted: recentWithVariances.map((st) => ({
        id: st.id,
        warehouse: st.warehouse.name,
        completedAt: st.completedAt,
        itemsWithVariance: st.items.length,
      })),
    };
  }
}
