import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QrService } from '../qr/qr.service';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import { RequestStatus } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

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
      throw new NotFoundException(`Source warehouse with ID ${dto.sourceWarehouseId} not found`);
    }

    const destWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.destinationWarehouseId },
    });
    if (!destWarehouse) {
      throw new NotFoundException(`Destination warehouse with ID ${dto.destinationWarehouseId} not found`);
    }

    for (const item of dto.items) {
      const inventoryItem = await this.prisma.inventoryItem.findUnique({
        where: { id: item.inventoryItemId },
      });

      if (!inventoryItem) {
        throw new NotFoundException(`Inventory item with ID ${item.inventoryItemId} not found`);
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

  async findAll(pagination?: PaginationDto, status?: RequestStatus) {
    const page = pagination?.page || 1;
    const limit = pagination?.limit || 10;
    const skip = (page - 1) * limit;

    const where = status ? { status } : {};

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

    return {
      data: requests,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPending(pagination?: PaginationDto) {
    return this.findAll(pagination, RequestStatus.PENDING);
  }

  async findOne(id: string) {
    const request = await this.prisma.transferRequest.findUnique({
      where: { id },
      include: this.includeFull,
    });

    if (!request) {
      throw new NotFoundException(`Transfer request with ID ${id} not found`);
    }

    return request;
  }

  async approve(id: string, approvedById: string) {
    const request = await this.findOne(id);

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException(`Transfer request is not pending. Current status: ${request.status}`);
    }

    for (const item of request.items) {
      const inventoryItem = await this.prisma.inventoryItem.findUnique({
        where: { id: item.inventoryItemId },
      });

      if (!inventoryItem || inventoryItem.quantity < item.quantity) {
        throw new BadRequestException(
          `Insufficient quantity for item ${item.inventoryItem.name}. Transfer cannot be approved.`
        );
      }
    }

    const updated = await this.prisma.transferRequest.update({
      where: { id },
      data: {
        status: RequestStatus.APPROVED,
        approvedById,
        approvedAt: new Date(),
      },
      include: this.includeFull,
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
  async sendTransfer(id: string) {
    const request = await this.findOne(id);

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

    if (request.status !== RequestStatus.SENT) {
      throw new BadRequestException(
        `Cannot confirm receipt. Transfer is in ${request.status} status.`
      );
    }

    // Execute the transfer - update inventory quantities
    for (const item of request.items) {
      await this.prisma.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { quantity: { decrement: item.quantity } },
      });

      const existingInDest = await this.prisma.inventoryItem.findFirst({
        where: {
          warehouseId: request.destinationWarehouseId,
          name: item.inventoryItem.name,
          category: item.inventoryItem.category,
          sku: item.inventoryItem.sku,
        },
      });

      if (existingInDest) {
        await this.prisma.inventoryItem.update({
          where: { id: existingInDest.id },
          data: { quantity: { increment: item.quantity } },
        });
      } else {
        await this.prisma.inventoryItem.create({
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

    const updated = await this.prisma.transferRequest.update({
      where: { id: request.id },
      data: {
        status: RequestStatus.COMPLETED,
        receivedAt: new Date(),
        receivedById: userId,
      },
      include: this.includeFull,
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

  async reject(id: string, rejectedById: string, reason?: string) {
    const request = await this.findOne(id);

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
   * Complete transfer without QR (legacy method)
   */
  async complete(id: string, completedById: string) {
    const request = await this.findOne(id);

    // Allow completing from APPROVED (legacy) or SENT status
    if (request.status !== RequestStatus.APPROVED && request.status !== RequestStatus.SENT) {
      throw new BadRequestException(
        `Transfer request must be approved or sent first. Current status: ${request.status}`
      );
    }

    for (const item of request.items) {
      await this.prisma.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: { quantity: { decrement: item.quantity } },
      });

      const existingInDest = await this.prisma.inventoryItem.findFirst({
        where: {
          warehouseId: request.destinationWarehouseId,
          name: item.inventoryItem.name,
          category: item.inventoryItem.category,
          sku: item.inventoryItem.sku,
        },
      });

      if (existingInDest) {
        await this.prisma.inventoryItem.update({
          where: { id: existingInDest.id },
          data: { quantity: { increment: item.quantity } },
        });
      } else {
        await this.prisma.inventoryItem.create({
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

    const updated = await this.prisma.transferRequest.update({
      where: { id },
      data: { status: RequestStatus.COMPLETED },
      include: this.includeFull,
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'TransferRequest',
      entityId: id,
      userId: completedById,
      changes: { status: 'COMPLETED', itemsTransferred: request.items.length },
    });

    return updated;
  }

  async cancel(id: string, cancelledById: string) {
    const request = await this.findOne(id);

    if (request.status === RequestStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed transfer request');
    }

    const updated = await this.prisma.transferRequest.update({
      where: { id },
      data: { status: RequestStatus.CANCELLED },
      include: this.includeFull,
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

  async getStats() {
    const [total, pending, approved, sent, completed, rejected, cancelled] = await Promise.all([
      this.prisma.transferRequest.count(),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.PENDING } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.APPROVED } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.SENT } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.COMPLETED } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.REJECTED } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.CANCELLED } }),
    ]);

    return {
      total,
      byStatus: { pending, approved, sent, completed, rejected, cancelled },
    };
  }
}
