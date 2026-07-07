import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CustomerType,
  SaleStatus,
  Prisma,
  type Sale,
  type SaleItem,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { FilterSaleDto } from './dto/filter-sale.dto';
import {
  parsePagination,
  buildPaginationMeta,
  parseSortOrder,
} from '../common/dto';
import { warehouseFilter } from '../common/warehouse-access/warehouse-filter.util';

// Round to 2 decimals to avoid floating point noise accumulating in totals.
const round2 = (n: number) => Math.round(n * 100) / 100;

interface SaleItemSeed {
  inventoryItemId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  itemName?: string | null;
  serviceTag?: string | null;
  currency?: string | null;
  notes?: string | null;
}

interface CreateInternalArgs {
  name?: string | null;
  warehouseId: string;
  customerName?: string | null;
  customerType: CustomerType;
  currency: string;
  totalAmount: number;
  notes?: string | null;
  createdById: string;
  items: SaleItemSeed[];
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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
    dto: CreateSaleDto,
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
      throw new BadRequestException('At least one item is required');
    }

    const ids = dto.items.map((i) => i.inventoryItemId);
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Duplicate inventory item in sale payload');
    }

    // Snapshot name/serviceTag at sale time so PDFs and reports survive item
    // renames or hard-delete attempts. Prices come from the DTO (entered by the
    // seller per customer tier), NOT from the item.
    const items = await this.prisma.inventoryItem.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        name: true,
        serviceTag: true,
        warehouseId: true,
        quantity: true,
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
          `Item ${line.inventoryItemId} does not belong to the selected warehouse`,
        );
      }
    }

    const currency = dto.currency ?? 'USD';
    const lineSeeds: SaleItemSeed[] = dto.items.map((line) => {
      const snapshot = itemMap.get(line.inventoryItemId);
      return {
        inventoryItemId: line.inventoryItemId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: round2(line.unitPrice * line.quantity),
        itemName: snapshot?.name ?? null,
        serviceTag: snapshot?.serviceTag ?? null,
        currency,
        notes: line.notes ?? null,
      };
    });
    const totalAmount = round2(
      lineSeeds.reduce((sum, l) => sum + l.lineTotal, 0),
    );

    return this.createInternal({
      name: dto.name?.trim() || null,
      warehouseId: dto.warehouseId,
      customerName: dto.customerName?.trim() || null,
      customerType: dto.customerType,
      currency,
      totalAmount,
      notes: dto.notes ?? null,
      createdById: userId,
      items: lineSeeds,
    });
  }

  /**
   * Decrements stock and writes the sale in a single transaction. Stock
   * validation lives INSIDE the transaction to prevent races between
   * concurrent sales/outflows on the same item.
   */
  async createInternal(args: CreateInternalArgs) {
    const ids = args.items.map((i) => i.inventoryItemId);

    const sale = await this.prisma.$transaction(async (tx) => {
      const currentItems = await tx.inventoryItem.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true, quantity: true, name: true },
      });
      const currentMap = new Map(currentItems.map((i) => [i.id, i]));

      for (const line of args.items) {
        const current = currentMap.get(line.inventoryItemId);
        if (!current) {
          throw new BadRequestException(
            `Item ${line.inventoryItemId} is no longer available`,
          );
        }
        if (current.quantity < line.quantity) {
          throw new BadRequestException(
            `Insufficient quantity for item ${current.name}. Available: ${current.quantity}, Requested: ${line.quantity}`,
          );
        }
      }

      await Promise.all(
        args.items.map((line) =>
          tx.inventoryItem.update({
            where: { id: line.inventoryItemId },
            data: { quantity: { decrement: line.quantity } },
          }),
        ),
      );

      return tx.sale.create({
        data: {
          name: args.name,
          warehouseId: args.warehouseId,
          customerName: args.customerName,
          customerType: args.customerType,
          currency: args.currency,
          totalAmount: args.totalAmount,
          status: SaleStatus.ACTIVE,
          notes: args.notes,
          createdById: args.createdById,
          items: {
            create: args.items.map((line) => ({
              inventoryItemId: line.inventoryItemId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              itemName: line.itemName ?? null,
              serviceTag: line.serviceTag ?? null,
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
      entity: 'Sale',
      entityId: sale.id,
      userId: args.createdById,
      changes: {
        after: {
          warehouseId: sale.warehouseId,
          customerType: sale.customerType,
          currency: sale.currency,
          totalAmount: sale.totalAmount,
          status: sale.status,
          itemCount: sale.items.length,
        },
      },
    });

    return sale;
  }

  async findAll(filters: FilterSaleDto, userWarehouseIds?: string[] | null) {
    const { page, limit, skip } = parsePagination(filters);

    const wFilter = warehouseFilter(userWarehouseIds);
    const where: Prisma.SaleWhereInput = {
      ...wFilter,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.customerType ? { customerType: filters.customerType } : {}),
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: parseSortOrder(filters.sortOrder) },
        include: this.includeLight,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(id: string, userWarehouseIds?: string[] | null) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: this.includeFull,
    });
    if (!sale) {
      throw new NotFoundException('Sale not found');
    }
    if (
      userWarehouseIds != null &&
      !userWarehouseIds.includes(sale.warehouseId)
    ) {
      throw new ForbiddenException('You do not have access to this sale');
    }
    return sale;
  }

  async cancel(
    id: string,
    userId: string,
    reason?: string,
    userWarehouseIds?: string[] | null,
  ): Promise<Sale & { items: SaleItem[] }> {
    // Access check first to fail fast outside the transaction
    await this.findOne(id, userWarehouseIds);

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.sale.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!current) {
        throw new NotFoundException('Sale not found');
      }
      if (current.status !== SaleStatus.ACTIVE) {
        throw new BadRequestException(
          `Cannot cancel sale in ${current.status} status`,
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

      return tx.sale.update({
        where: { id },
        data: {
          status: SaleStatus.CANCELLED,
          cancelledById: userId,
          cancelledAt: new Date(),
          cancellationReason: reason ?? null,
        },
        include: this.includeFull,
      });
    });

    this.auditService.logSafe({
      action: 'UPDATE',
      entity: 'Sale',
      entityId: id,
      userId,
      changes: {
        before: { status: 'ACTIVE' },
        after: { status: 'CANCELLED', cancellationReason: reason ?? null },
        fields: ['status', 'cancellationReason'],
      },
    });

    return updated;
  }

  async getStats(userWarehouseIds?: string[] | null) {
    const wFilter = warehouseFilter(userWarehouseIds);

    const [total, active, cancelled] = await Promise.all([
      this.prisma.sale.count({ where: { ...wFilter } }),
      this.prisma.sale.count({
        where: { status: SaleStatus.ACTIVE, ...wFilter },
      }),
      this.prisma.sale.count({
        where: { status: SaleStatus.CANCELLED, ...wFilter },
      }),
    ]);

    const byCustomerTypeRaw = await this.prisma.sale.groupBy({
      by: ['customerType'],
      where: { status: SaleStatus.ACTIVE, ...wFilter },
      _count: { _all: true },
    });
    const byCustomerType = byCustomerTypeRaw.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.customerType] = row._count._all;
        return acc;
      },
      {},
    );

    // Revenue from ACTIVE sales, one running total per currency.
    const revenueRaw = await this.prisma.sale.groupBy({
      by: ['currency'],
      where: { status: SaleStatus.ACTIVE, ...wFilter },
      _sum: { totalAmount: true },
    });
    const revenueByCurrency = revenueRaw.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.currency] = round2(row._sum.totalAmount ?? 0);
        return acc;
      },
      {},
    );

    return { total, active, cancelled, byCustomerType, revenueByCurrency };
  }
}
