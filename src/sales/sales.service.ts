import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  CustomerType,
  SaleStatus,
  PaymentCondition,
  PaymentStatus,
  Prisma,
  type Sale,
  type SaleItem,
} from '@prisma/client';
import { attachBalances } from '../common/balance/balance.util';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { SaleNumberingService } from './sale-numbering.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
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
  taxPercent?: number | null;
  taxAmount?: number | null;
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
  clientId?: string | null;
  paymentCondition: PaymentCondition;
  currency: string;
  totalAmount: number;
  taxPercent?: number | null;
  taxAmount: number;
  notes?: string | null;
  createdById: string;
  items: SaleItemSeed[];
  asDraft?: boolean;
}

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly saleNumbering: SaleNumberingService,
    private readonly permissionsService: PermissionsService,
  ) {}

  /**
   * Per-line tax, using each line's own taxPercent if set, else the sale's.
   * Shared by create/update/confirm so the math lives in exactly one place.
   */
  private computeTotals(
    items: Array<{ lineTotal: number; taxPercent?: number | null }>,
    saleTaxPercent?: number | null,
  ): { lineTaxAmounts: number[]; totalAmount: number; taxAmount: number } {
    const lineTaxAmounts = items.map((item) => {
      const effectivePercent = item.taxPercent ?? saleTaxPercent ?? 0;
      return round2((item.lineTotal * effectivePercent) / 100);
    });
    const totalAmount = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
    const taxAmount = round2(lineTaxAmounts.reduce((sum, t) => sum + t, 0));
    return { lineTaxAmounts, totalAmount, taxAmount };
  }

  /**
   * Decision 15: a CREDIT sale linked to a Client with a configured
   * creditLimit is blocked if the client's other open CREDIT sales'
   * combined balance, plus this sale's own amount, would exceed it. A CASH
   * sale, a sale with no client, or a client with no creditLimit configured
   * never triggers a single extra query — unrestricted credit by default.
   *
   * Locks the Client row (same FOR UPDATE mechanism as the numbering
   * services) so two concurrent credit sales for the same client serialize
   * instead of both reading a stale "room left" figure.
   */
  private async enforceCreditLimit(
    tx: Prisma.TransactionClient,
    args: {
      clientId: string | null;
      paymentCondition: PaymentCondition;
      amount: number;
      excludeSaleId?: string;
    },
  ): Promise<void> {
    if (!args.clientId || args.paymentCondition !== PaymentCondition.CREDIT) {
      return;
    }

    const [client] = await tx.$queryRaw<
      { id: string; creditLimit: number | null }[]
    >(Prisma.sql`
      SELECT "id","creditLimit" FROM "clients" WHERE "id" = ${args.clientId} FOR UPDATE
    `);
    if (client?.creditLimit == null) return;

    const openSales = await tx.sale.findMany({
      where: {
        clientId: args.clientId,
        status: SaleStatus.ACTIVE,
        paymentCondition: PaymentCondition.CREDIT,
        ...(args.excludeSaleId ? { id: { not: args.excludeSaleId } } : {}),
      },
      select: { id: true, totalAmount: true, taxAmount: true },
    });

    const saleIds = openSales.map((s) => s.id);
    const paidAgg = saleIds.length
      ? await tx.payment.aggregate({
          where: { saleId: { in: saleIds }, status: PaymentStatus.ACTIVE },
          _sum: { amount: true },
        })
      : { _sum: { amount: 0 } };

    const outstanding =
      openSales.reduce(
        (sum, s) => sum + s.totalAmount + (s.taxAmount ?? 0),
        0,
      ) - (paidAgg._sum.amount ?? 0);
    const projected = round2(outstanding + args.amount);

    if (projected > client.creditLimit) {
      throw new BadRequestException(
        `This sale would exceed the client's credit limit (${client.creditLimit}). Outstanding + this sale: ${projected}`,
      );
    }
  }

  private readonly includeLight = {
    warehouse: { select: { id: true, name: true } },
    client: { select: { id: true, name: true } },
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
    client: { select: { id: true, name: true } },
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
    const lineSeedsBase = dto.items.map((line) => {
      const snapshot = itemMap.get(line.inventoryItemId);
      return {
        inventoryItemId: line.inventoryItemId,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: round2(line.unitPrice * line.quantity),
        taxPercent: line.taxPercent ?? null,
        itemName: snapshot?.name ?? null,
        serviceTag: snapshot?.serviceTag ?? null,
        currency,
        notes: line.notes ?? null,
      };
    });
    const { totalAmount, taxAmount, lineTaxAmounts } = this.computeTotals(
      lineSeedsBase,
      dto.taxPercent,
    );
    const lineSeeds: SaleItemSeed[] = lineSeedsBase.map((seed, i) => ({
      ...seed,
      taxAmount: lineTaxAmounts[i],
    }));

    return this.createInternal({
      name: dto.name?.trim() || null,
      warehouseId: dto.warehouseId,
      customerName: dto.customerName?.trim() || null,
      customerType: dto.customerType,
      clientId: dto.clientId ?? null,
      paymentCondition: dto.paymentCondition ?? PaymentCondition.CASH,
      currency,
      totalAmount,
      taxPercent: dto.taxPercent ?? null,
      taxAmount,
      notes: dto.notes ?? null,
      createdById: userId,
      items: lineSeeds,
      asDraft: dto.asDraft ?? false,
    });
  }

  /**
   * Decrements stock and writes the sale in a single transaction. Stock
   * validation lives INSIDE the transaction to prevent races between
   * concurrent sales/outflows on the same item.
   */
  async createInternal(args: CreateInternalArgs) {
    const ids = args.items.map((i) => i.inventoryItemId);
    const itemsData = args.items.map((line) => ({
      inventoryItemId: line.inventoryItemId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      taxPercent: line.taxPercent ?? null,
      taxAmount: line.taxAmount ?? 0,
      itemName: line.itemName ?? null,
      serviceTag: line.serviceTag ?? null,
      currency: line.currency ?? null,
      notes: line.notes ?? null,
    }));

    const sale = await this.prisma.$transaction(async (tx) => {
      // A DRAFT quotation reserves nothing: no stock check/decrement, no
      // invoice number (never wasted on a quote that's discarded — a real
      // number is only assigned when the sale actually becomes ACTIVE,
      // here or later via confirm()).
      if (args.asDraft) {
        return tx.sale.create({
          data: {
            name: args.name,
            warehouseId: args.warehouseId,
            customerName: args.customerName,
            customerType: args.customerType,
            clientId: args.clientId ?? null,
            paymentCondition: args.paymentCondition,
            currency: args.currency,
            totalAmount: args.totalAmount,
            taxPercent: args.taxPercent ?? null,
            taxAmount: args.taxAmount,
            status: SaleStatus.DRAFT,
            number: null,
            notes: args.notes,
            createdById: args.createdById,
            items: { create: itemsData },
          },
          include: this.includeFull,
        });
      }

      // A DRAFT reserves nothing, so the credit-limit check (which only
      // ever matters once a sale actually commits a client to the debt)
      // runs here, before the stock lookup — a blocked sale touches nothing.
      await this.enforceCreditLimit(tx, {
        clientId: args.clientId ?? null,
        paymentCondition: args.paymentCondition,
        amount: round2(args.totalAmount + args.taxAmount),
      });

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

      const { number } = await this.saleNumbering.assignNumber(tx);

      return tx.sale.create({
        data: {
          name: args.name,
          warehouseId: args.warehouseId,
          customerName: args.customerName,
          customerType: args.customerType,
          clientId: args.clientId ?? null,
          paymentCondition: args.paymentCondition,
          currency: args.currency,
          totalAmount: args.totalAmount,
          taxPercent: args.taxPercent ?? null,
          taxAmount: args.taxAmount,
          status: SaleStatus.ACTIVE,
          number,
          notes: args.notes,
          createdById: args.createdById,
          items: { create: itemsData },
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
          number: sale.number,
          itemCount: sale.items.length,
        },
      },
    });

    return sale;
  }

  async findAll(filters: FilterSaleDto, userWarehouseIds?: string[] | null) {
    const wFilter = warehouseFilter(userWarehouseIds);
    const where: Prisma.SaleWhereInput = {
      ...wFilter,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.customerType ? { customerType: filters.customerType } : {}),
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
    };

    const { page, limit, skip } = parsePagination(filters);

    if (!filters.onlyWithBalance) {
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
      const withBalance = await attachBalances(this.prisma, data, 'saleId');
      return {
        data: withBalance,
        meta: buildPaginationMeta(total, page, limit),
      };
    }

    // Accounts Receivable view: balance is derived, never stored, so it
    // can't be filtered at the DB layer without raw SQL. Bounded candidate
    // fetch + in-memory filter/paginate — fine while ACTIVE sales stay in
    // the hundreds/low thousands; move to a raw SQL HAVING query if this
    // table outgrows that.
    const candidates = await this.prisma.sale.findMany({
      where: { ...where, status: SaleStatus.ACTIVE },
      orderBy: { createdAt: parseSortOrder(filters.sortOrder) },
      include: this.includeLight,
      take: 2000,
    });
    const withBalance = await attachBalances(this.prisma, candidates, 'saleId');
    const filtered = withBalance.filter((s) => s.balance > 0);
    const start = (page - 1) * limit;
    return {
      data: filtered.slice(start, start + limit),
      meta: buildPaginationMeta(filtered.length, page, limit),
    };
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

  /**
   * Edits a DRAFT quotation in place (fields + items), recomputing totals.
   * Any status other than DRAFT is rejected — a confirmed or cancelled sale
   * is not editable.
   */
  async update(
    id: string,
    dto: UpdateSaleDto,
    userId: string,
    userWarehouseIds?: string[] | null,
  ): Promise<Sale & { items: SaleItem[] }> {
    await this.findOne(id, userWarehouseIds);

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.sale.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!current) {
        throw new NotFoundException('Sale not found');
      }
      if (current.status !== SaleStatus.DRAFT) {
        throw new BadRequestException(
          `Cannot edit a sale in ${current.status} status`,
        );
      }

      const targetWarehouseId = dto.warehouseId ?? current.warehouseId;
      const targetCurrency = dto.currency ?? current.currency;
      const targetTaxPercent =
        dto.taxPercent !== undefined ? dto.taxPercent : current.taxPercent;

      let lineSeeds: SaleItemSeed[];
      if (dto.items) {
        const ids = dto.items.map((i) => i.inventoryItemId);
        if (new Set(ids).size !== ids.length) {
          throw new BadRequestException(
            'Duplicate inventory item in sale payload',
          );
        }
        const items = await tx.inventoryItem.findMany({
          where: { id: { in: ids }, deletedAt: null },
          select: { id: true, name: true, serviceTag: true, warehouseId: true },
        });
        if (items.length !== ids.length) {
          throw new NotFoundException('One or more inventory items not found');
        }
        const itemMap = new Map(items.map((i) => [i.id, i]));
        for (const line of dto.items) {
          const item = itemMap.get(line.inventoryItemId);
          if (item && item.warehouseId !== targetWarehouseId) {
            throw new BadRequestException(
              `Item ${line.inventoryItemId} does not belong to the selected warehouse`,
            );
          }
        }
        lineSeeds = dto.items.map((line) => {
          const snapshot = itemMap.get(line.inventoryItemId);
          return {
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: round2(line.unitPrice * line.quantity),
            taxPercent: line.taxPercent ?? null,
            itemName: snapshot?.name ?? null,
            serviceTag: snapshot?.serviceTag ?? null,
            currency: targetCurrency,
            notes: line.notes ?? null,
          };
        });
      } else {
        lineSeeds = current.items.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          taxPercent: item.taxPercent,
          itemName: item.itemName,
          serviceTag: item.serviceTag,
          currency: item.currency,
          notes: item.notes,
        }));
      }

      const { totalAmount, taxAmount, lineTaxAmounts } = this.computeTotals(
        lineSeeds,
        targetTaxPercent,
      );

      return tx.sale.update({
        where: { id },
        data: {
          name:
            dto.name !== undefined ? dto.name?.trim() || null : current.name,
          warehouseId: targetWarehouseId,
          customerName:
            dto.customerName !== undefined
              ? dto.customerName?.trim() || null
              : current.customerName,
          customerType: dto.customerType ?? current.customerType,
          currency: targetCurrency,
          notes: dto.notes !== undefined ? (dto.notes ?? null) : current.notes,
          taxPercent: targetTaxPercent,
          totalAmount,
          taxAmount,
          items: {
            deleteMany: {},
            create: lineSeeds.map((seed, i) => ({
              inventoryItemId: seed.inventoryItemId,
              quantity: seed.quantity,
              unitPrice: seed.unitPrice,
              lineTotal: seed.lineTotal,
              taxPercent: seed.taxPercent ?? null,
              taxAmount: lineTaxAmounts[i],
              itemName: seed.itemName ?? null,
              serviceTag: seed.serviceTag ?? null,
              currency: seed.currency ?? null,
              notes: seed.notes ?? null,
            })),
          },
        },
        include: this.includeFull,
      });
    });

    this.auditService.logSafe({
      action: 'UPDATE',
      entity: 'Sale',
      entityId: id,
      userId,
      changes: { fields: Object.keys(dto) },
    });

    return updated;
  }

  /**
   * Converts a DRAFT quotation into a real, numbered, stock-decrementing
   * sale. Re-validates stock in real time (a draft reserves nothing) and
   * assigns the invoice number atomically in the same transaction as the
   * stock decrement, via SaleNumberingService.
   */
  async confirm(
    id: string,
    userId: string,
    userWarehouseIds?: string[] | null,
  ): Promise<Sale & { items: SaleItem[] }> {
    await this.findOne(id, userWarehouseIds);

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.sale.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!current) {
        throw new NotFoundException('Sale not found');
      }
      // Also guards against a double-confirm race: a second concurrent
      // request simply 400s here once the first one has already flipped
      // the status.
      if (current.status !== SaleStatus.DRAFT) {
        throw new BadRequestException(
          `Cannot confirm sale in ${current.status} status`,
        );
      }

      const { totalAmount, taxAmount, lineTaxAmounts } = this.computeTotals(
        current.items,
        current.taxPercent,
      );

      // Same "fail cheap before touching stock" ordering as createInternal's
      // ACTIVE branch; excludeSaleId keeps this DRAFT's own (not-yet-ACTIVE)
      // amount from double-counting itself in the "other open sales" sum.
      await this.enforceCreditLimit(tx, {
        clientId: current.clientId,
        paymentCondition: current.paymentCondition,
        amount: round2(totalAmount + taxAmount),
        excludeSaleId: current.id,
      });

      const ids = current.items.map((i) => i.inventoryItemId);
      const currentItems = await tx.inventoryItem.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true, quantity: true, name: true },
      });
      const currentMap = new Map(currentItems.map((i) => [i.id, i]));

      for (const line of current.items) {
        const item = currentMap.get(line.inventoryItemId);
        if (!item) {
          throw new BadRequestException(
            `Item ${line.inventoryItemId} is no longer available`,
          );
        }
        if (item.quantity < line.quantity) {
          throw new BadRequestException(
            `Insufficient quantity for item ${item.name}. Available: ${item.quantity}, Requested: ${line.quantity}`,
          );
        }
      }

      await Promise.all(
        current.items.map((line) =>
          tx.inventoryItem.update({
            where: { id: line.inventoryItemId },
            data: { quantity: { decrement: line.quantity } },
          }),
        ),
      );

      const { number } = await this.saleNumbering.assignNumber(tx);

      return tx.sale.update({
        where: { id },
        data: {
          status: SaleStatus.ACTIVE,
          number,
          totalAmount,
          taxAmount,
          items: {
            updateMany: current.items.map((item, i) => ({
              where: { id: item.id },
              data: { taxAmount: lineTaxAmounts[i] },
            })),
          },
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
        before: { status: 'DRAFT' },
        after: { status: 'ACTIVE', number: updated.number },
        fields: ['status', 'number'],
      },
    });

    return updated;
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
      if (current.status === SaleStatus.CANCELLED) {
        throw new BadRequestException(
          `Cannot cancel sale in ${current.status} status`,
        );
      }

      if (current.status === SaleStatus.ACTIVE) {
        // A DRAFT never touched stock, so cancelling one is safe for
        // anyone who could create/edit it (sales:create). Reversing a real,
        // stock-decrementing sale needs the stronger sales:cancel — checked
        // fresh here (never user.permissions, which is lazy/stale by
        // design) since the controller route is OR-gated to accept either
        // permission.
        const perms =
          await this.permissionsService.getPermissionsForUser(userId);
        if (!perms.includes('*') && !perms.includes('sales:cancel')) {
          throw new ForbiddenException('Access denied');
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
      }

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

    const [total, active, draft, cancelled] = await Promise.all([
      this.prisma.sale.count({ where: { ...wFilter } }),
      this.prisma.sale.count({
        where: { status: SaleStatus.ACTIVE, ...wFilter },
      }),
      this.prisma.sale.count({
        where: { status: SaleStatus.DRAFT, ...wFilter },
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

    return {
      total,
      active,
      draft,
      cancelled,
      byCustomerType,
      revenueByCurrency,
    };
  }
}
