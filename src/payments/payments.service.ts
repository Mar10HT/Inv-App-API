import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  PaymentStatus,
  SaleStatus,
  PurchaseInvoiceStatus,
  Prisma,
  type Payment,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { FilterPaymentDto } from './dto/filter-payment.dto';
import {
  parsePagination,
  buildPaginationMeta,
  parseSortOrder,
} from '../common/dto';

const round2 = (n: number) => Math.round(n * 100) / 100;

interface LockedDocRow {
  id: string;
  status: string;
  totalAmount: number;
  taxAmount: number | null;
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  private readonly includeFull = {
    createdBy: { select: { id: true, name: true, email: true } },
    cancelledBy: { select: { id: true, name: true, email: true } },
  };

  async create(
    dto: CreatePaymentDto,
    userId: string,
    userWarehouseIds?: string[] | null,
  ): Promise<Payment> {
    if (!!dto.saleId === !!dto.purchaseInvoiceId) {
      throw new BadRequestException(
        'Exactly one of saleId or purchaseInvoiceId is required',
      );
    }
    const isSale = !!dto.saleId;

    const warehouseId = await this.resolveDocumentWarehouseId(
      dto.saleId ?? null,
      dto.purchaseInvoiceId ?? null,
    );
    if (!warehouseId) {
      throw new NotFoundException(
        isSale ? 'Sale not found' : 'Purchase invoice not found',
      );
    }
    if (userWarehouseIds != null && !userWarehouseIds.includes(warehouseId)) {
      throw new ForbiddenException('You do not have access to this document');
    }

    const payment = await this.prisma.$transaction(async (tx) => {
      const balance = isSale
        ? await this.lockAndComputeBalance(
            tx,
            'sale',
            dto.saleId as string,
            SaleStatus.ACTIVE,
          )
        : await this.lockAndComputeBalance(
            tx,
            'purchaseInvoice',
            dto.purchaseInvoiceId as string,
            PurchaseInvoiceStatus.ACTIVE,
          );

      if (dto.amount > balance) {
        throw new BadRequestException(
          `Payment amount (${dto.amount}) exceeds the current balance (${balance})`,
        );
      }

      return tx.payment.create({
        data: {
          saleId: dto.saleId ?? null,
          purchaseInvoiceId: dto.purchaseInvoiceId ?? null,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference ?? null,
          notes: dto.notes ?? null,
          createdById: userId,
        },
        include: this.includeFull,
      });
    });

    this.auditService.logSafe({
      action: 'CREATE',
      entity: 'Payment',
      entityId: payment.id,
      userId,
      changes: {
        after: {
          saleId: payment.saleId,
          purchaseInvoiceId: payment.purchaseInvoiceId,
          amount: payment.amount,
          method: payment.method,
        },
      },
    });

    return payment;
  }

  /**
   * Locks the parent document row (SELECT...FOR UPDATE, same mechanism as
   * SaleNumberingService/PurchaseNumberingService) so a concurrent payment
   * against the same document serializes behind this one, then computes the
   * balance fresh. No stored balance field exists anywhere — this is the
   * only source of truth, always recomputed.
   */
  private async lockAndComputeBalance(
    tx: Prisma.TransactionClient,
    doc: 'sale' | 'purchaseInvoice',
    id: string,
    requiredStatus: string,
  ): Promise<number> {
    const rows =
      doc === 'sale'
        ? await tx.$queryRaw<LockedDocRow[]>(Prisma.sql`
            SELECT "id","status","totalAmount","taxAmount" FROM "sales" WHERE "id" = ${id} FOR UPDATE
          `)
        : await tx.$queryRaw<LockedDocRow[]>(Prisma.sql`
            SELECT "id","status","totalAmount","taxAmount" FROM "purchase_invoices" WHERE "id" = ${id} FOR UPDATE
          `);

    const current = rows[0];
    if (!current) {
      throw new NotFoundException('Document not found');
    }
    if (current.status !== requiredStatus) {
      throw new BadRequestException(
        `Cannot record a payment against a document in ${current.status} status`,
      );
    }

    const field = doc === 'sale' ? 'saleId' : 'purchaseInvoiceId';
    const { _sum } = await tx.payment.aggregate({
      where: { [field]: id, status: PaymentStatus.ACTIVE },
      _sum: { amount: true },
    });

    return round2(
      current.totalAmount + (current.taxAmount ?? 0) - (_sum.amount ?? 0),
    );
  }

  private async resolveDocumentWarehouseId(
    saleId: string | null,
    purchaseInvoiceId: string | null,
  ): Promise<string | null> {
    if (saleId) {
      const sale = await this.prisma.sale.findUnique({
        where: { id: saleId },
        select: { warehouseId: true },
      });
      return sale?.warehouseId ?? null;
    }
    const invoice = await this.prisma.purchaseInvoice.findUnique({
      where: { id: purchaseInvoiceId as string },
      select: { warehouseId: true },
    });
    return invoice?.warehouseId ?? null;
  }

  async findAll(filters: FilterPaymentDto, userWarehouseIds?: string[] | null) {
    const { page, limit, skip } = parsePagination(filters);

    const wFilter =
      userWarehouseIds == null
        ? {}
        : {
            OR: [
              { sale: { warehouseId: { in: userWarehouseIds } } },
              { purchaseInvoice: { warehouseId: { in: userWarehouseIds } } },
            ],
          };
    const where: Prisma.PaymentWhereInput = {
      ...wFilter,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.saleId ? { saleId: filters.saleId } : {}),
      ...(filters.purchaseInvoiceId
        ? { purchaseInvoiceId: filters.purchaseInvoiceId }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: parseSortOrder(filters.sortOrder) },
        include: this.includeFull,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, meta: buildPaginationMeta(total, page, limit) };
  }

  async findOne(
    id: string,
    userWarehouseIds?: string[] | null,
  ): Promise<Payment> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: this.includeFull,
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    if (userWarehouseIds != null) {
      const warehouseId = await this.resolveDocumentWarehouseId(
        payment.saleId,
        payment.purchaseInvoiceId,
      );
      if (!warehouseId || !userWarehouseIds.includes(warehouseId)) {
        throw new ForbiddenException('You do not have access to this payment');
      }
    }
    return payment;
  }

  async cancel(
    id: string,
    userId: string,
    reason?: string,
    userWarehouseIds?: string[] | null,
  ): Promise<Payment> {
    // Access check first to fail fast outside the transaction
    await this.findOne(id, userWarehouseIds);

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.payment.findUnique({ where: { id } });
      if (!current) {
        throw new NotFoundException('Payment not found');
      }
      if (current.status !== PaymentStatus.ACTIVE) {
        throw new BadRequestException(
          `Cannot cancel payment in ${current.status} status`,
        );
      }

      return tx.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.CANCELLED,
          cancelledById: userId,
          cancelledAt: new Date(),
          cancellationReason: reason ?? null,
        },
        include: this.includeFull,
      });
    });

    this.auditService.logSafe({
      action: 'UPDATE',
      entity: 'Payment',
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
    const wFilter =
      userWarehouseIds == null
        ? {}
        : {
            OR: [
              { sale: { warehouseId: { in: userWarehouseIds } } },
              { purchaseInvoice: { warehouseId: { in: userWarehouseIds } } },
            ],
          };

    const [total, active, cancelled] = await Promise.all([
      this.prisma.payment.count({ where: { ...wFilter } }),
      this.prisma.payment.count({
        where: { status: PaymentStatus.ACTIVE, ...wFilter },
      }),
      this.prisma.payment.count({
        where: { status: PaymentStatus.CANCELLED, ...wFilter },
      }),
    ]);

    const byMethodRaw = await this.prisma.payment.groupBy({
      by: ['method'],
      where: { status: PaymentStatus.ACTIVE, ...wFilter },
      _count: { _all: true },
    });
    const byMethod = byMethodRaw.reduce<Record<string, number>>((acc, row) => {
      acc[row.method] = row._count._all;
      return acc;
    }, {});

    return { total, active, cancelled, byMethod };
  }
}
