import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QrService } from '../qr/qr.service';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import { Prisma, RequestStatus } from '@prisma/client';
import { PaginationDto, parsePagination, buildPaginationMeta } from '../common/dto';
import { warehouseFilterMultiField } from '../common/warehouse-access/warehouse-filter.util';

@Injectable()
export class TransferRequestsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private qrService: QrService,
  ) {}

  private readonly includeLight = {
    sourceWarehouse: { select: { id: true, name: true } },
    destinationWarehouse: { select: { id: true, name: true } },
    requestedBy: { select: { id: true, name: true, email: true } },
    approvedBy: { select: { id: true, name: true, email: true } },
    receivedBy: { select: { id: true, name: true, email: true } },
    items: {
      include: {
        inventoryItem: { select: { id: true, name: true, serviceTag: true, quantity: true } },
      },
    },
  };

  private readonly includeFull = {
    sourceWarehouse: true,
    destinationWarehouse: true,
    requestedBy: { select: { id: true, name: true, email: true } },
    approvedBy: { select: { id: true, name: true, email: true } },
    receivedBy: { select: { id: true, name: true, email: true } },
    items: {
      include: {
        inventoryItem: { include: { warehouse: true } },
      },
    },
  };

  async create(dto: CreateTransferRequestDto, requestedById: string) {
    if (dto.sourceWarehouseId === dto.destinationWarehouseId) {
      throw new BadRequestException('Source and destination warehouses must be different');
    }

    const sourceWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.sourceWarehouseId },
    });
    if (!sourceWarehouse) {
      throw new NotFoundException('Source warehouse not found');
    }

    const destWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.destinationWarehouseId },
    });
    if (!destWarehouse) {
      throw new NotFoundException('Destination warehouse not found');
    }

    // Validate both warehouses are active
    if (!sourceWarehouse.isActive) {
      throw new BadRequestException('Source warehouse is inactive');
    }
    if (!destWarehouse.isActive) {
      throw new BadRequestException('Destination warehouse is inactive');
    }

    for (const item of dto.items) {
      const inventoryItem = await this.prisma.inventoryItem.findUnique({
        where: { id: item.inventoryItemId },
      });

      if (!inventoryItem) {
        throw new NotFoundException('Inventory item not found');
      }

      if (inventoryItem.warehouseId !== dto.sourceWarehouseId) {
        throw new BadRequestException(`Item ${inventoryItem.name} does not belong to source warehouse`);
      }

      if (inventoryItem.quantity < item.quantity) {
        throw new BadRequestException(
          `Insufficient quantity for item ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}`
        );
      }
    }

    const transferRequest = await this.prisma.transferRequest.create({
      data: {
        sourceWarehouseId: dto.sourceWarehouseId,
        destinationWarehouseId: dto.destinationWarehouseId,
        requestedById,
        notes: dto.notes,
        items: {
          create: dto.items.map(item => ({
            inventoryItemId: item.inventoryItemId,
            quantity: item.quantity,
          })),
        },
      },
      include: this.includeFull,
    });

    await this.auditService.log({
      action: 'CREATE',
      entity: 'TransferRequest',
      entityId: transferRequest.id,
      userId: requestedById,
      changes: { status: 'PENDING', itemCount: dto.items.length },
    });

    return transferRequest;
  }

  async findAll(pagination?: PaginationDto, status?: RequestStatus, warehouseIds?: string[] | null) {
    const { page, limit, skip } = parsePagination(pagination);

    const where: any = {
      ...(status ? { status } : {}),
      ...warehouseFilterMultiField(warehouseIds, ['sourceWarehouseId', 'destinationWarehouseId']),
    };

    const [requests, total] = await Promise.all([
      this.prisma.transferRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.includeLight,
      }),
      this.prisma.transferRequest.count({ where }),
    ]);

    return { data: requests, meta: buildPaginationMeta(total, page, limit) };
  }

  async findPending(pagination?: PaginationDto, warehouseIds?: string[] | null) {
    return this.findAll(pagination, RequestStatus.PENDING, warehouseIds);
  }

  async findOne(id: string) {
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: this.includeFull,
    });

    if (!request) {
      throw new NotFoundException('Transfer request not found');
    }

    return request;
  }

  async approve(id: string, approvedById: string, userWarehouseIds?: string[] | null) {
    const request = await this.findOne(id);
    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(request.sourceWarehouseId) ||
        userWarehouseIds.includes(request.destinationWarehouseId);
      if (!hasAccess) throw new ForbiddenException('You do not have access to the involved warehouses');
    }

    // Wrap status check, quantity validation, and update in a single transaction to prevent TOCTOU races
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.transferRequest.findUnique({
        where: { id },
        include: { items: { include: { inventoryItem: true } } },
      });
      if (!current || current.status !== RequestStatus.PENDING) {
        throw new BadRequestException(
          `Transfer request is not pending. Current status: ${current?.status ?? 'unknown'}`
        );
      }

      for (const item of current.items) {
        const inventoryItem = await tx.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
        });
        if (!inventoryItem || inventoryItem.quantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient quantity for item ${item.inventoryItem.name}. Transfer cannot be approved.`
          );
        }
      }

      return tx.transferRequest.update({
        where: { id },
        data: {
          status: RequestStatus.APPROVED,
          approvedById,
          approvedAt: new Date(),
        },
        include: this.includeFull,
      });
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'TransferRequest',
      entityId: id,
      userId: approvedById,
      changes: { status: 'APPROVED' },
    });

    return updated;
  }

  // ==================== QR-Based Operations ====================

  /**
   * Send transfer - generates QR code for receipt confirmation
   */
  async sendTransfer(id: string, userWarehouseIds?: string[] | null) {
    const request = await this.findOne(id);
    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(request.sourceWarehouseId) ||
        userWarehouseIds.includes(request.destinationWarehouseId);
      if (!hasAccess) throw new ForbiddenException('You do not have access to the involved warehouses');
    }

    if (request.status !== RequestStatus.APPROVED) {
      throw new BadRequestException(
        `Cannot send transfer in ${request.status} status. Only APPROVED transfers can be sent.`
      );
    }

    const sendQrCode = this.qrService.generateCode();

    const updated = await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: RequestStatus.SENT,
        sendQrCode,
      },
      include: this.includeFull,
    });

    const qrData = {
      type: 'TRANSFER' as const,
      id: request.id,
      code: sendQrCode,
    };
    const qrDataUrl = await this.qrService.generateQrDataUrl(qrData);

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'TransferRequest',
      entityId: id,
      userId: request.approvedById || request.requestedById,
      changes: { status: 'SENT', qrGenerated: true },
    });

    return {
      ...updated,
      qrCodeDataUrl: qrDataUrl,
    };
  }

  /**
   * Confirm receipt by scanning QR code - also completes the transfer
   */
  async confirmReceipt(qrCode: string, userId: string) {
    const request = await this.prisma.transferRequest.findFirst({
      where: { sendQrCode: qrCode },
      include: this.includeFull,
    });

    if (!request) {
      throw new NotFoundException('Invalid QR code or transfer not found');
    }

    // Execute the transfer - all inventory modifications in a single transaction.
    // NOTE [M3]: Promise.all inside $transaction is safe on SQLite (dev) but can cause
    // serialization conflicts on PostgreSQL under high concurrency. See comments in complete().
    const updated = await this.prisma.$transaction(async (tx) => {
      // Re-check status inside the transaction to prevent double-confirmation under concurrency
      const current = await tx.transferRequest.findUnique({ where: { id: request.id }, select: { status: true } });
      if (!current || current.status !== RequestStatus.SENT) {
        throw new BadRequestException(
          `Cannot confirm receipt. Transfer is in ${current?.status ?? 'unknown'} status.`
        );
      }
      return this.applyInventoryTransfer(tx, request, userId);
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'TransferRequest',
      entityId: request.id,
      userId,
      changes: { status: 'COMPLETED', confirmedViaQr: true, itemsTransferred: request.items.length },
    });

    return updated;
  }

  /**
   * Get QR code image for a transfer
   */
  async getQrCode(id: string) {
    const request = await this.findOne(id);

    if (!request.sendQrCode) {
      throw new BadRequestException('QR code not generated. Send the transfer first.');
    }

    const qrData = {
      type: 'TRANSFER' as const,
      id: request.id,
      code: request.sendQrCode,
    };

    return this.qrService.generateQrDataUrl(qrData);
  }

  /**
   * Process scanned QR code
   */
  async processQrCode(scannedData: string, userId: string) {
    const qrData = this.qrService.parseQrData(scannedData);

    if (!qrData) {
      throw new BadRequestException('Invalid QR code format');
    }

    if (qrData.type !== 'TRANSFER') {
      throw new BadRequestException('This QR code is not for a transfer');
    }

    return this.confirmReceipt(qrData.code, userId);
  }

  // ==================== Standard Operations ====================

  async reject(id: string, rejectedById: string, reason?: string, userWarehouseIds?: string[] | null) {
    const request = await this.findOne(id);
    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(request.sourceWarehouseId) ||
        userWarehouseIds.includes(request.destinationWarehouseId);
      if (!hasAccess) throw new ForbiddenException('You do not have access to the involved warehouses');
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`Transfer request is not pending. Current status: ${request.status}`);
    }

    const updated = await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: RequestStatus.REJECTED,
        approvedById: rejectedById,
        rejectedAt: new Date(),
        rejectedReason: reason,
      },
      include: this.includeFull,
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'TransferRequest',
      entityId: id,
      userId: rejectedById,
      changes: { status: 'REJECTED', reason },
    });

    return updated;
  }

  /**
   * Complete transfer without QR — used by the manual confirmation flow.
   * Only accepts SENT status. The request must be explicitly sent before it
   * can be manually confirmed as received.
   */
  async complete(id: string, completedById: string, userWarehouseIds?: string[] | null) {
    const request = await this.findOne(id);
    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(request.sourceWarehouseId) ||
        userWarehouseIds.includes(request.destinationWarehouseId);
      if (!hasAccess) throw new ForbiddenException('You do not have access to the involved warehouses');
    }

    // Execute the transfer - all inventory modifications in a single transaction.
    // NOTE [M3]: Promise.all inside $transaction is safe on SQLite (dev) but can cause
    // serialization conflicts on PostgreSQL under high concurrency. If this becomes an
    // issue in production, switch to sequential awaits or add a Serializable isolation
    // level (requires PostgreSQL — cannot be set in dev SQLite schema).
    const updated = await this.prisma.$transaction(async (tx) => {
      // Re-check status inside the transaction to prevent double-confirmation under concurrency
      const current = await tx.transferRequest.findUnique({ where: { id }, select: { status: true } });
      if (!current || current.status !== RequestStatus.SENT) {
        throw new BadRequestException(
          `Transfer request must be in SENT status to confirm receipt. Current status: ${current?.status ?? 'unknown'}`
        );
      }
      return this.applyInventoryTransfer(tx, request, completedById);
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'TransferRequest',
      entityId: id,
      userId: completedById,
      changes: { status: 'COMPLETED', confirmedManually: true, itemsTransferred: request.items.length },
    });

    return updated;
  }

  /**
   * Apply inventory transfer: validate quantities, decrement source, increment/create destination,
   * and mark the transfer request as COMPLETED. Must be called inside a $transaction.
   */
  private async applyInventoryTransfer(
    tx: Prisma.TransactionClient,
    request: {
      id: string;
      destinationWarehouseId: string;
      items: Array<{
        inventoryItemId: string;
        quantity: number;
        inventoryItem: {
          name: string;
          description: string | null;
          quantity: number;
          minQuantity: number;
          category: string | null;
          price: number | null;
          currency: string | null;
          sku: string | null;
          supplierId: string | null;
          itemType: string;
        };
      }>;
    },
    receivedById: string,
  ): Promise<any> {
    // Re-validate quantities inside the transaction to prevent negative stock
    // in case another operation decremented inventory since the request was approved.
    for (const item of request.items) {
      const currentItem = await tx.inventoryItem.findUnique({ where: { id: item.inventoryItemId } });
      if (!currentItem || currentItem.quantity < item.quantity) {
        throw new BadRequestException(
          `Insufficient quantity for item: ${item.inventoryItem.name}. Available: ${currentItem?.quantity ?? 0}, Required: ${item.quantity}`
        );
      }
    }

    // Decrement source quantities sequentially — same reason as destination below:
    // parallel decrements on the same item under READ COMMITTED (PostgreSQL default)
    // can produce negative stock if two transactions read before either writes.
    for (const item of request.items) {
      await tx.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { quantity: { decrement: item.quantity } },
      });
    }

    // Find and update/create destination items sequentially to prevent concurrent transactions
    // from both seeing no existing item and racing to create duplicates (findFirst + create TOCTOU).
    for (const item of request.items) {
      const existingInDest = await tx.inventoryItem.findFirst({
        where: {
          warehouseId: request.destinationWarehouseId,
          name: item.inventoryItem.name,
          category: item.inventoryItem.category ?? undefined,
          sku: item.inventoryItem.sku ?? undefined,
        },
      });

      if (existingInDest) {
        await tx.inventoryItem.update({
          where: { id: existingInDest.id },
          data: { quantity: { increment: item.quantity } },
        });
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (tx.inventoryItem.create as any)({
          data: {
            name: item.inventoryItem.name,
            description: item.inventoryItem.description,
            quantity: item.quantity,
            minQuantity: item.inventoryItem.minQuantity,
            category: item.inventoryItem.category,
            price: item.inventoryItem.price,
            currency: item.inventoryItem.currency,
            sku: item.inventoryItem.sku ? `${item.inventoryItem.sku}-${request.destinationWarehouseId.slice(0, 4)}` : null,
            warehouseId: request.destinationWarehouseId,
            supplierId: item.inventoryItem.supplierId,
            itemType: item.inventoryItem.itemType,
          },
        });
      }
    }

    // Update transfer request status within the same transaction
    return tx.transferRequest.update({
      where: { id: request.id },
      data: {
        status: RequestStatus.COMPLETED,
        receivedAt: new Date(),
        receivedById,
      },
      include: this.includeFull,
    });
  }

  async cancel(id: string, cancelledById: string, userWarehouseIds?: string[] | null) {
    const request = await this.findOne(id);
    if (userWarehouseIds != null) {
      const hasAccess =
        userWarehouseIds.includes(request.sourceWarehouseId) ||
        userWarehouseIds.includes(request.destinationWarehouseId);
      if (!hasAccess) throw new ForbiddenException('You do not have access to the involved warehouses');
    }

    // Wrap status check and update in a single transaction to prevent TOCTOU races
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.transferRequest.findUnique({ where: { id }, select: { status: true } });
      if (!current || current.status === RequestStatus.COMPLETED || current.status === RequestStatus.REJECTED || current.status === RequestStatus.CANCELLED) {
        throw new BadRequestException(
          `Cannot cancel a transfer request in ${current?.status ?? 'unknown'} status`
        );
      }
      return tx.transferRequest.update({
        where: { id },
        data: { status: RequestStatus.CANCELLED },
        include: this.includeFull,
      });
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'TransferRequest',
      entityId: id,
      userId: cancelledById,
      changes: { status: 'CANCELLED' },
    });

    return updated;
  }

  async getStats(warehouseIds?: string[] | null) {
    const wFilter = warehouseFilterMultiField(warehouseIds, ['sourceWarehouseId', 'destinationWarehouseId']);

    const [total, pending, approved, sent, completed, rejected, cancelled] = await Promise.all([
      this.prisma.transferRequest.count({ where: { ...wFilter } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.PENDING, ...wFilter } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.APPROVED, ...wFilter } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.SENT, ...wFilter } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.COMPLETED, ...wFilter } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.REJECTED, ...wFilter } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.CANCELLED, ...wFilter } }),
    ]);

    return {
      total,
      byStatus: { pending, approved, sent, completed, rejected, cancelled },
    };
  }
}
