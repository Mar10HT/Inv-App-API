import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  OutflowReason,
  OutflowStatus,
  Prisma,
  type Outflow,
  type OutflowItem,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateOutflowDto } from './dto/create-outflow.dto';
import { FilterOutflowDto } from './dto/filter-outflow.dto';
import {
  parsePagination,
  buildPaginationMeta,
  parseSortOrder,
} from '../common/dto';
import {
  warehouseFilter,
  selectedWarehouseFilter,
} from '../common/warehouse-access/warehouse-filter.util';
import { StockLevelService } from '../alerts/stock-level.service';
import { DocumentNumberingService } from '../common/numbering/document-numbering.service';
import { apiError } from '../common/errors/api-error';
import { lockForUpdate } from '../common/locking';
import { takeStock } from '../inventory/stock.util';

interface OutflowItemSeed {
  inventoryItemId: string;
  quantity: number;
  itemName?: string | null;
  serviceTag?: string | null;
  unitPrice?: number | null;
  currency?: string | null;
  notes?: string | null;
}

interface CreateInternalArgs {
  warehouseId: string;
  reason: OutflowReason;
  notes?: string | null;
  createdById: string;
  items: OutflowItemSeed[];
}

@Injectable()
export class OutflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly documentNumbering: DocumentNumberingService,
    private readonly stockLevelService: StockLevelService,
  ) {}

  private readonly includeLight = {
    warehouse: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true, email: true } },
    cancelledBy: { select: { id: true, name: true, email: true } },
    items: {
      include: {
        inventoryItem: {
          select: { id: true, name: true, serviceTag: true, quantity: true },
        },
      },
    },
  };

  private readonly includeFull = {
    warehouse: true,
    createdBy: { select: { id: true, name: true, email: true } },
    cancelledBy: { select: { id: true, name: true, email: true } },
    items: {
      include: {
        inventoryItem: {
          select: {
            id: true,
            name: true,
            serviceTag: true,
            quantity: true,
            price: true,
            currency: true,
          },
        },
      },
    },
  };

  async create(
    dto: CreateOutflowDto,
    userId: string,
    userWarehouseIds?: string[] | null,
  ) {
    if (
      userWarehouseIds != null &&
      !userWarehouseIds.includes(dto.warehouseId)
    ) {
      throw new ForbiddenException('You do not have access to this warehouse');
    }

    if (!dto.items?.length) {
      throw new BadRequestException(
        apiError('ITEMS_REQUIRED', 'At least one item is required'),
      );
    }

    const ids = dto.items.map((i) => i.inventoryItemId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException(
        apiError(
          'DUPLICATE_INVENTORY_ITEM',
          'Duplicate inventory item in outflow payload',
        ),
      );
    }

    // Snapshot price/currency at outflow time so PDFs and reports reflect the
    // historical value, not whatever the item's price drifts to later.
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        name: true,
        serviceTag: true,
        warehouseId: true,
        quantity: true,
        price: true,
        currency: true,
      },
    });
    if (items.length !== ids.length) {
      throw new NotFoundException('One or more inventory items not found');
    }
    const itemMap = new Map(items.map((i) => [i.id, i]));

    for (const line of dto.items) {
      const item = itemMap.get(line.inventoryItemId);
      if (!item) {
        throw new NotFoundException(`Item ${line.inventoryItemId} not found`);
      }
      if (item.warehouseId !== dto.warehouseId) {
        throw new BadRequestException(
          apiError(
            'ITEM_NOT_IN_WAREHOUSE',
            `Item ${line.inventoryItemId} does not belong to the selected warehouse`,
            { item: line.inventoryItemId },
          ),
        );
      }
    }

    return this.createInternal({
      warehouseId: dto.warehouseId,
      reason: dto.reason,
      notes: dto.notes ?? null,
      createdById: userId,
      items: dto.items.map((line) => {
        const snapshot = itemMap.get(line.inventoryItemId);
        return {
          inventoryItemId: line.inventoryItemId,
          quantity: line.quantity,
          itemName: snapshot?.name ?? null,
          serviceTag: snapshot?.serviceTag ?? null,
          unitPrice: snapshot?.price ?? null,
          currency: snapshot?.currency ?? null,
          notes: line.notes ?? null,
        };
      }),
    });
  }

  /**
   * Shared create path used by both the public endpoint and by integrations
   * (e.g. discharge approval). Decrements stock and writes the outflow in a
   * single transaction. Stock validation lives INSIDE the transaction to
   * prevent races between concurrent outflows on the same item.
   */
  async createInternal(args: CreateInternalArgs) {
    const ids = args.items.map((i) => i.inventoryItemId);

    const outflow = await this.prisma.$transaction(async (tx) => {
      const currentItems = await tx.inventoryItem.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true, quantity: true, name: true },
      });
      const currentMap = new Map(currentItems.map((i) => [i.id, i]));

      for (const line of args.items) {
        const current = currentMap.get(line.inventoryItemId);
        if (!current) {
          throw new BadRequestException(
            apiError(
              'ITEM_NO_LONGER_AVAILABLE',
              `Item ${line.inventoryItemId} is no longer available`,
              { item: line.inventoryItemId },
            ),
          );
        }
        if (current.quantity < line.quantity) {
          throw new BadRequestException(
            apiError(
              'INSUFFICIENT_STOCK',
              `Insufficient quantity for item ${current.name}. Available: ${current.quantity}, Requested: ${line.quantity}`,
              {
                item: current.name,
                available: current.quantity,
                requested: line.quantity,
              },
            ),
          );
        }
      }

      // The check above gives the friendly error; takeStock is what keeps two
      // concurrent outflows/sales from taking the same last units.
      for (const line of args.items) {
        await takeStock(tx, line.inventoryItemId, line.quantity);
      }

      return tx.outflow.create({
        data: {
          number: await this.documentNumbering.assignNumber(tx, 'OUTFLOW'),
          warehouseId: args.warehouseId,
          reason: args.reason,
          status: OutflowStatus.ACTIVE,
          notes: args.notes,
          createdById: args.createdById,
          items: {
            create: args.items.map((line) => ({
              inventoryItemId: line.inventoryItemId,
              quantity: line.quantity,
              itemName: line.itemName ?? null,
              serviceTag: line.serviceTag ?? null,
              unitPrice: line.unitPrice ?? null,
              currency: line.currency ?? null,
              notes: line.notes ?? null,
            })),
          },
        },
        include: this.includeFull,
      });
    });

    this.auditService.logSafe({
      action: 'CREATE',
      entity: 'Outflow',
      entityId: outflow.id,
      userId: args.createdById,
      changes: {
        after: {
          number: outflow.number,
          warehouseId: outflow.warehouseId,
          reason: outflow.reason,
          status: outflow.status,
          itemCount: outflow.items.length,
        },
      },
    });

    this.stockLevelService.scheduleRefresh();
    return outflow;
  }

  async findAll(filters: FilterOutflowDto, userWarehouseIds?: string[] | null) {
    const { page, limit, skip } = parsePagination(filters);

    const wFilter = selectedWarehouseFilter(
      userWarehouseIds,
      filters.warehouseId,
    );
    const where: Prisma.OutflowWhereInput = {
      ...wFilter,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.reason ? { reason: filters.reason } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.outflow.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: parseSortOrder(filters.sortOrder) },
        include: this.includeLight,
      }),
      this.prisma.outflow.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string, userWarehouseIds?: string[] | null) {
    const outflow = await this.prisma.outflow.findUnique({
      where: { id },
      include: this.includeFull,
    });
    if (!outflow) {
      throw new NotFoundException('Outflow not found');
    }
    if (
      userWarehouseIds != null &&
      !userWarehouseIds.includes(outflow.warehouseId)
    ) {
      throw new ForbiddenException('You do not have access to this outflow');
    }
    return outflow;
  }

  async cancel(
    id: string,
    userId: string,
    reason?: string,
    userWarehouseIds?: string[] | null,
  ): Promise<Outflow & { items: OutflowItem[] }> {
    // Access check first to fail fast outside the transaction
    await this.findOne(id, userWarehouseIds);

    const updated = await this.prisma.$transaction(async (tx) => {
      // A concurrent cancel waits here, then reads CANCELLED: stock is restored once
      await lockForUpdate(tx, 'outflows', id);
      const current = await tx.outflow.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!current) {
        throw new NotFoundException('Outflow not found');
      }
      if (current.status !== OutflowStatus.ACTIVE) {
        throw new BadRequestException(
          apiError(
            'OUTFLOW_NOT_CANCELLABLE',
            `Cannot cancel outflow in ${current.status} status`,
            { status: current.status },
          ),
        );
      }

      // Restore stock for each item
      await Promise.all(
        current.items.map((line) =>
          tx.inventoryItem.update({
            where: { id: line.inventoryItemId },
            data: { quantity: { increment: line.quantity } },
          }),
        ),
      );

      return tx.outflow.update({
        where: { id },
        data: {
          status: OutflowStatus.CANCELLED,
          cancelledById: userId,
          cancelledAt: new Date(),
          cancellationReason: reason ?? null,
        },
        include: this.includeFull,
      });
    });

    this.auditService.logSafe({
      action: 'UPDATE',
      entity: 'Outflow',
      entityId: id,
      userId,
      changes: {
        before: { status: 'ACTIVE' },
        after: { status: 'CANCELLED', cancellationReason: reason ?? null },
        fields: ['status', 'cancellationReason'],
      },
    });

    this.stockLevelService.scheduleRefresh();
    return updated;
  }

  async getStats(userWarehouseIds?: string[] | null) {
    const wFilter = warehouseFilter(userWarehouseIds);

    const [total, active, cancelled] = await Promise.all([
      this.prisma.outflow.count({ where: { ...wFilter } }),
      this.prisma.outflow.count({
        where: { status: OutflowStatus.ACTIVE, ...wFilter },
      }),
      this.prisma.outflow.count({
        where: { status: OutflowStatus.CANCELLED, ...wFilter },
      }),
    ]);

    const byReasonRaw = await this.prisma.outflow.groupBy({
      by: ['reason'],
      where: { status: OutflowStatus.ACTIVE, ...wFilter },
      _count: { _all: true },
    });

    const byReason = byReasonRaw.reduce<Record<string, number>>((acc, row) => {
      acc[row.reason] = row._count._all;
      return acc;
    }, {});

    return { total, active, cancelled, byReason };
  }
}
