import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import {
  ItemType,
  InventoryStatus,
  PurchaseInvoiceStatus,
  PaymentCondition,
  Prisma,
  type PurchaseInvoice,
  type PurchaseInvoiceItem,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PurchaseNumberingService } from './purchase-numbering.service';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { FilterPurchaseInvoiceDto } from './dto/filter-purchase-invoice.dto';
import {
  parsePagination,
  buildPaginationMeta,
  parseSortOrder,
} from '../common/dto';
import { warehouseFilter } from '../common/warehouse-access/warehouse-filter.util';
import { attachBalances } from '../common/balance/balance.util';

// Round to 2 decimals to avoid floating point noise accumulating in totals.
const round2 = (n: number) => Math.round(n * 100) / 100;

interface TaxableLine {
  lineTotal: number;
  taxPercent?: number | null;
}

interface BulkSeed extends TaxableLine {
  inventoryItemId: string;
  quantity: number;
  unitPrice: number;
  itemName: string | null;
  serviceTag: string | null;
}

interface UniqueSeed extends TaxableLine {
  name: string;
  category: string;
  model: string | null;
  serviceTag: string;
  serialNumber: string | null;
  unitPrice: number;
}

@Injectable()
export class PurchaseInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly purchaseNumbering: PurchaseNumberingService,
  ) {}

  /**
   * Per-line tax, using each line's own taxPercent if set, else the invoice's.
   * Same math as SalesService.computeTotals, one copy per numbering service
   * per the design call: duplicating this ~10-line helper beats sharing a
   * generic engine across documents that otherwise evolve independently.
   */
  private computeTotals(
    items: TaxableLine[],
    invoiceTaxPercent?: number | null,
  ): { lineTaxAmounts: number[]; totalAmount: number; taxAmount: number } {
    const lineTaxAmounts = items.map((item) => {
      const effectivePercent = item.taxPercent ?? invoiceTaxPercent ?? 0;
      return round2((item.lineTotal * effectivePercent) / 100);
    });
    const totalAmount = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
    const taxAmount = round2(lineTaxAmounts.reduce((sum, t) => sum + t, 0));
    return { lineTaxAmounts, totalAmount, taxAmount };
  }

  private readonly includeLight = {
    warehouse: { select: { id: true, name: true } },
    supplier: { select: { id: true, name: true } },
    createdBy: { select: { id: true, name: true, email: true } },
    cancelledBy: { select: { id: true, name: true, email: true } },
    items: {
      include: {
        inventoryItem: {
          select: { id: true, name: true, serviceTag: true, itemType: true },
        },
      },
    },
  };

  private readonly includeFull = {
    warehouse: true,
    supplier: true,
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
            itemType: true,
            price: true,
            currency: true,
          },
        },
      },
    },
  };

  async create(
    dto: CreatePurchaseInvoiceDto,
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

    const bulkLines = dto.items.filter((i) => i.kind === ItemType.BULK);
    const uniqueLines = dto.items.filter((i) => i.kind === ItemType.UNIQUE);

    const bulkIds = bulkLines.map((i) => i.inventoryItemId as string);
    if (new Set(bulkIds).size !== bulkIds.length) {
      throw new BadRequestException(
        'Duplicate inventory item in purchase payload',
      );
    }

    const serviceTags = uniqueLines.map((i) => i.serviceTag as string);
    if (new Set(serviceTags).size !== serviceTags.length) {
      throw new BadRequestException(
        'Duplicate service tag in purchase payload',
      );
    }

    const existingInvoice = await this.prisma.purchaseInvoice.findUnique({
      where: {
        supplierId_invoiceNumber: {
          supplierId: dto.supplierId,
          invoiceNumber: dto.invoiceNumber,
        },
      },
    });
    if (existingInvoice) {
      throw new ConflictException(
        `An invoice "${dto.invoiceNumber}" already exists for this supplier`,
      );
    }

    // Snapshot name/serviceTag at purchase time, same reason Sale/Outflow do:
    // PDFs and reports survive item renames or hard-delete attempts.
    const bulkItems = bulkIds.length
      ? await this.prisma.inventoryItem.findMany({
          where: { id: { in: bulkIds }, deletedAt: null },
          select: {
            id: true,
            name: true,
            serviceTag: true,
            warehouseId: true,
            itemType: true,
          },
        })
      : [];
    if (bulkItems.length !== bulkIds.length) {
      throw new NotFoundException('One or more inventory items not found');
    }
    const bulkItemMap = new Map(bulkItems.map((i) => [i.id, i]));

    for (const line of bulkLines) {
      const item = bulkItemMap.get(line.inventoryItemId as string);
      if (!item) {
        throw new NotFoundException(`Item ${line.inventoryItemId} not found`);
      }
      if (item.warehouseId !== dto.warehouseId) {
        throw new BadRequestException(
          `Item ${line.inventoryItemId} does not belong to the selected warehouse`,
        );
      }
      // A UNIQUE item's quantity is always exactly 1 — topping it up through
      // a BULK line would silently break that invariant.
      if (item.itemType !== ItemType.BULK) {
        throw new BadRequestException(
          `Item ${line.inventoryItemId} is a serialized (UNIQUE) item and cannot be purchased as a BULK line`,
        );
      }
    }

    const currency = dto.currency ?? 'USD';

    const bulkSeedsBase: BulkSeed[] = bulkLines.map((line) => {
      const snapshot = bulkItemMap.get(line.inventoryItemId as string);
      return {
        inventoryItemId: line.inventoryItemId as string,
        quantity: line.quantity as number,
        unitPrice: line.unitPrice,
        lineTotal: round2(line.unitPrice * (line.quantity as number)),
        taxPercent: line.taxPercent ?? null,
        itemName: snapshot?.name ?? null,
        serviceTag: snapshot?.serviceTag ?? null,
      };
    });

    const uniqueSeedsBase: UniqueSeed[] = uniqueLines.map((line) => ({
      name: line.name as string,
      category: line.category as string,
      model: line.model ?? null,
      serviceTag: line.serviceTag as string,
      serialNumber: line.serialNumber ?? null,
      unitPrice: line.unitPrice,
      lineTotal: round2(line.unitPrice * 1),
      taxPercent: line.taxPercent ?? null,
    }));

    const { totalAmount, taxAmount, lineTaxAmounts } = this.computeTotals(
      [...bulkSeedsBase, ...uniqueSeedsBase],
      dto.taxPercent,
    );
    const bulkTaxAmounts = lineTaxAmounts.slice(0, bulkSeedsBase.length);
    const uniqueTaxAmounts = lineTaxAmounts.slice(bulkSeedsBase.length);

    const invoice = await this.prisma.$transaction(async (tx) => {
      if (bulkSeedsBase.length) {
        const currentItems = await tx.inventoryItem.findMany({
          where: { id: { in: bulkIds }, deletedAt: null },
          select: { id: true, itemType: true },
        });
        const currentItemMap = new Map(currentItems.map((i) => [i.id, i]));
        for (const seed of bulkSeedsBase) {
          const current = currentItemMap.get(seed.inventoryItemId);
          if (!current) {
            throw new BadRequestException(
              `Item ${seed.inventoryItemId} is no longer available`,
            );
          }
          // Re-check inside the transaction: itemType can change between the
          // pre-transaction snapshot and here (e.g. a concurrent edit from
          // Inventory), and only this check runs immediately before the
          // mutation that would otherwise corrupt the UNIQUE quantity=1 invariant.
          if (current.itemType !== ItemType.BULK) {
            throw new BadRequestException(
              `Item ${seed.inventoryItemId} is a serialized (UNIQUE) item and cannot be purchased as a BULK line`,
            );
          }
        }

        await Promise.all(
          bulkSeedsBase.map((seed) =>
            tx.inventoryItem.update({
              where: { id: seed.inventoryItemId },
              data: { quantity: { increment: seed.quantity } },
            }),
          ),
        );
      }

      const createdUniqueItems = await Promise.all(
        uniqueSeedsBase.map((seed) =>
          tx.inventoryItem.create({
            data: {
              name: seed.name,
              category: seed.category,
              model: seed.model,
              itemType: ItemType.UNIQUE,
              serviceTag: seed.serviceTag,
              serialNumber: seed.serialNumber,
              quantity: 1,
              status: InventoryStatus.IN_STOCK,
              price: seed.unitPrice,
              currency,
              warehouseId: dto.warehouseId,
              supplierId: dto.supplierId,
              createdById: userId,
            },
          }),
        ),
      );

      const { number } = await this.purchaseNumbering.assignNumber(tx);

      const itemsCreate = [
        ...bulkSeedsBase.map((seed, i) => ({
          inventoryItemId: seed.inventoryItemId,
          quantity: seed.quantity,
          unitPrice: seed.unitPrice,
          lineTotal: seed.lineTotal,
          taxPercent: seed.taxPercent,
          taxAmount: bulkTaxAmounts[i],
          itemName: seed.itemName,
          serviceTag: seed.serviceTag,
          currency,
        })),
        ...uniqueSeedsBase.map((seed, i) => ({
          inventoryItemId: createdUniqueItems[i].id,
          quantity: 1,
          unitPrice: seed.unitPrice,
          lineTotal: seed.lineTotal,
          taxPercent: seed.taxPercent,
          taxAmount: uniqueTaxAmounts[i],
          itemName: seed.name,
          serviceTag: seed.serviceTag,
          currency,
        })),
      ];

      return tx.purchaseInvoice.create({
        data: {
          number,
          invoiceNumber: dto.invoiceNumber,
          supplierId: dto.supplierId,
          warehouseId: dto.warehouseId,
          currency,
          totalAmount,
          taxPercent: dto.taxPercent ?? null,
          taxAmount,
          paymentCondition: dto.paymentCondition ?? PaymentCondition.CASH,
          notes: dto.notes ?? null,
          createdById: userId,
          items: { create: itemsCreate },
        },
        include: this.includeFull,
      });
    });

    this.auditService.logSafe({
      action: 'CREATE',
      entity: 'PurchaseInvoice',
      entityId: invoice.id,
      userId,
      changes: {
        after: {
          warehouseId: invoice.warehouseId,
          supplierId: invoice.supplierId,
          status: invoice.status,
          number: invoice.number,
          itemCount: invoice.items.length,
        },
      },
    });

    return invoice;
  }

  async findAll(
    filters: FilterPurchaseInvoiceDto,
    userWarehouseIds?: string[] | null,
  ) {
    const wFilter = warehouseFilter(userWarehouseIds);
    const where: Prisma.PurchaseInvoiceWhereInput = {
      ...wFilter,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.warehouseId ? { warehouseId: filters.warehouseId } : {}),
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
    };

    const { page, limit, skip } = parsePagination(filters);

    if (!filters.onlyWithBalance) {
      const [data, total] = await Promise.all([
        this.prisma.purchaseInvoice.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: parseSortOrder(filters.sortOrder) },
          include: this.includeLight,
        }),
        this.prisma.purchaseInvoice.count({ where }),
      ]);
      const withBalance = await attachBalances(
        this.prisma,
        data,
        'purchaseInvoiceId',
      );
      return {
        data: withBalance,
        meta: buildPaginationMeta(total, page, limit),
      };
    }

    // Accounts Payable view — same bounded-candidate, in-memory filter/
    // paginate approach as SalesService.findAll, same rationale (see there).
    const candidates = await this.prisma.purchaseInvoice.findMany({
      where: { ...where, status: PurchaseInvoiceStatus.ACTIVE },
      orderBy: { createdAt: parseSortOrder(filters.sortOrder) },
      include: this.includeLight,
      take: 2000,
    });
    const withBalance = await attachBalances(
      this.prisma,
      candidates,
      'purchaseInvoiceId',
    );
    const filtered = withBalance.filter((p) => p.balance > 0);
    const start = (page - 1) * limit;
    return {
      data: filtered.slice(start, start + limit),
      meta: buildPaginationMeta(filtered.length, page, limit),
    };
  }

  async findOne(id: string, userWarehouseIds?: string[] | null) {
    const invoice = await this.prisma.purchaseInvoice.findUnique({
      where: { id },
      include: this.includeFull,
    });
    if (!invoice) {
      throw new NotFoundException('Purchase invoice not found');
    }
    if (
      userWarehouseIds != null &&
      !userWarehouseIds.includes(invoice.warehouseId)
    ) {
      throw new ForbiddenException(
        'You do not have access to this purchase invoice',
      );
    }
    return invoice;
  }

  /**
   * A 100% BULK invoice cancels like an Outflow in reverse: restores the
   * stock it had added, blocked if that would go negative (meaning the
   * stock already left via a later sale/outflow/transfer). ANY UNIQUE line
   * blocks the whole cancellation without touching stock — that unit's
   * serial number is permanent inventory history, not something to undo by
   * deleting the InventoryItem it created. A data-entry mistake on a UNIQUE
   * line is fixed from Inventory directly, not from here.
   */
  async cancel(
    id: string,
    userId: string,
    reason?: string,
    userWarehouseIds?: string[] | null,
  ): Promise<PurchaseInvoice & { items: PurchaseInvoiceItem[] }> {
    await this.findOne(id, userWarehouseIds);

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.purchaseInvoice.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              inventoryItem: {
                select: { itemType: true, quantity: true, name: true },
              },
            },
          },
        },
      });
      if (!current) {
        throw new NotFoundException('Purchase invoice not found');
      }
      if (current.status !== PurchaseInvoiceStatus.ACTIVE) {
        throw new BadRequestException(
          `Cannot cancel purchase invoice in ${current.status} status`,
        );
      }

      const hasUniqueLine = current.items.some(
        (item) => item.inventoryItem.itemType === ItemType.UNIQUE,
      );
      if (hasUniqueLine) {
        throw new BadRequestException(
          'This purchase includes serialized units. Delete them individually from Inventory if this was a data-entry mistake; cancelling a purchase with serialized lines is not supported.',
        );
      }

      for (const item of current.items) {
        if (item.inventoryItem.quantity < item.quantity) {
          throw new BadRequestException(
            `Cannot cancel: stock for ${item.inventoryItem.name} has already left via a later sale, outflow, or transfer`,
          );
        }
      }

      await Promise.all(
        current.items.map((item) =>
          tx.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { quantity: { decrement: item.quantity } },
          }),
        ),
      );

      return tx.purchaseInvoice.update({
        where: { id },
        data: {
          status: PurchaseInvoiceStatus.CANCELLED,
          cancelledById: userId,
          cancelledAt: new Date(),
          cancellationReason: reason ?? null,
        },
        include: this.includeFull,
      });
    });

    this.auditService.logSafe({
      action: 'UPDATE',
      entity: 'PurchaseInvoice',
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
      this.prisma.purchaseInvoice.count({ where: { ...wFilter } }),
      this.prisma.purchaseInvoice.count({
        where: { status: PurchaseInvoiceStatus.ACTIVE, ...wFilter },
      }),
      this.prisma.purchaseInvoice.count({
        where: { status: PurchaseInvoiceStatus.CANCELLED, ...wFilter },
      }),
    ]);

    const totalByCurrencyRaw = await this.prisma.purchaseInvoice.groupBy({
      by: ['currency'],
      where: { status: PurchaseInvoiceStatus.ACTIVE, ...wFilter },
      _sum: { totalAmount: true },
    });
    const totalByCurrency = totalByCurrencyRaw.reduce<Record<string, number>>(
      (acc, row) => {
        acc[row.currency] = round2(row._sum.totalAmount ?? 0);
        return acc;
      },
      {},
    );

    return { total, active, cancelled, totalByCurrency };
  }
}
