import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateStockTakeDto, UpdateStockTakeItemDto } from './dto/create-stock-take.dto';
import { StockTakeStatus } from '@prisma/client';
import { PaginationDto, parsePagination, buildPaginationMeta } from '../common/dto';

@Injectable()
export class StockTakeService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateStockTakeDto, startedById: string) {
    // Validate warehouse exists
    const warehouse = await this.prisma.tenant().warehouse.findUnique({
      where: { id: dto.warehouseId },
    });

    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${dto.warehouseId} not found`);
    }

    // Check for existing in-progress stock take
    const existing = await this.prisma.tenant().stockTake.findFirst({
      where: {
        warehouseId: dto.warehouseId,
        status: StockTakeStatus.IN_PROGRESS,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `There is already an in-progress stock take for this warehouse (ID: ${existing.id})`
      );
    }

    // Get all items in the warehouse
    const items = await this.prisma.tenant().inventoryItem.findMany({
      where: {
        warehouseId: dto.warehouseId,
        deletedAt: null,
      },
    });

    // Create stock take with all items
    const stockTake = await this.prisma.tenant().stockTake.create({
      data: {
        warehouseId: dto.warehouseId,
        startedById,
        notes: dto.notes,
        items: {
          create: items.map(item => ({
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

    await this.auditService.log({
      action: 'CREATE',
      entity: 'StockTake',
      entityId: stockTake.id,
      userId: startedById,
      changes: { warehouseId: dto.warehouseId, itemCount: items.length },
    });

    return stockTake;
  }

  async findAll(pagination?: PaginationDto, status?: StockTakeStatus) {
    const { page, limit, skip } = parsePagination(pagination);
    const where = status ? { status } : {};

    const [stockTakes, total] = await Promise.all([
      this.prisma.tenant().stockTake.findMany({
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
      this.prisma.tenant().stockTake.count({ where }),
    ]);

    return { data: stockTakes, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string) {
    const stockTake = await this.prisma.tenant().stockTake.findUnique({
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

  async updateItem(stockTakeId: string, dto: UpdateStockTakeItemDto, userId: string) {
    const stockTake = await this.findOne(stockTakeId);

    if (stockTake.status !== StockTakeStatus.IN_PROGRESS) {
      throw new BadRequestException('Cannot update items on a completed or cancelled stock take');
    }

    const stockTakeItem = await this.prisma.tenant().stockTakeItem.findFirst({
      where: {
        stockTakeId,
        itemId: dto.itemId,
      },
    });

    if (!stockTakeItem) {
      throw new NotFoundException(`Item ${dto.itemId} not found in this stock take`);
    }

    const variance = dto.countedQty - stockTakeItem.expectedQty;

    const updated = await this.prisma.tenant().stockTakeItem.update({
      where: { id: stockTakeItem.id },
      data: {
        countedQty: dto.countedQty,
        variance,
        notes: dto.notes,
        countedAt: new Date(),
      },
      include: {
        item: true,
      },
    });

    return updated;
  }

  async complete(id: string, completedById: string, applyChanges: boolean = false) {
    const stockTake = await this.findOne(id);

    if (stockTake.status !== StockTakeStatus.IN_PROGRESS) {
      throw new BadRequestException('Stock take is not in progress');
    }

    // Check if all items have been counted
    const uncountedItems = stockTake.items.filter(item => item.countedQty === null);
    if (uncountedItems.length > 0) {
      throw new BadRequestException(
        `${uncountedItems.length} items have not been counted yet`
      );
    }

    // Apply inventory changes and mark as COMPLETED in one atomic transaction.
    // The stockTake.update is always the last step inside the transaction so that
    // the status only changes if all preceding writes succeed.
    const updated = await this.prisma.tenant().$transaction(async (tx) => {
      if (applyChanges) {
        for (const stockItem of stockTake.items) {
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

      return tx.stockTake.update({
        where: { id },
        data: {
          status: StockTakeStatus.COMPLETED,
          completedById,
          completedAt: new Date(),
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
    });

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

    return updated;
  }

  async cancel(id: string, cancelledById: string) {
    const stockTake = await this.findOne(id);

    if (stockTake.status === StockTakeStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed stock take');
    }

    const updated = await this.prisma.tenant().stockTake.update({
      where: { id },
      data: {
        status: StockTakeStatus.CANCELLED,
      },
      include: {
        warehouse: true,
        startedBy: { select: { id: true, name: true, email: true } },
      },
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
      item => item.variance !== null && item.variance !== 0
    );

    const summary = {
      totalItems: stockTake.items.length,
      countedItems: stockTake.items.filter(i => i.countedQty !== null).length,
      itemsWithVariance: itemsWithVariance.length,
      positiveVariance: itemsWithVariance.filter(i => (i.variance || 0) > 0).length,
      negativeVariance: itemsWithVariance.filter(i => (i.variance || 0) < 0).length,
      totalPositiveVariance: itemsWithVariance
        .filter(i => (i.variance || 0) > 0)
        .reduce((sum, i) => sum + (i.variance || 0), 0),
      totalNegativeVariance: itemsWithVariance
        .filter(i => (i.variance || 0) < 0)
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
      items: itemsWithVariance.map(item => ({
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
      this.prisma.tenant().stockTake.count(),
      this.prisma.tenant().stockTake.count({ where: { status: StockTakeStatus.IN_PROGRESS } }),
      this.prisma.tenant().stockTake.count({ where: { status: StockTakeStatus.COMPLETED } }),
      this.prisma.tenant().stockTake.count({ where: { status: StockTakeStatus.CANCELLED } }),
    ]);

    // Get recent stock takes with variances
    const recentWithVariances = await this.prisma.tenant().stockTake.findMany({
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
      recentCompleted: recentWithVariances.map(st => ({
        id: st.id,
        warehouse: st.warehouse.name,
        completedAt: st.completedAt,
        itemsWithVariance: st.items.length,
      })),
    };
  }
}
