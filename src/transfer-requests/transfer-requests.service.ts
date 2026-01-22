import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import { RequestStatus } from '@prisma/client';
import { PaginationDto } from '../common/dto/pagination.dto';

@Injectable()
export class TransferRequestsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
  ) {}

  async create(dto: CreateTransferRequestDto, requestedById: string) {
    // Validate warehouses are different
    if (dto.sourceWarehouseId === dto.destinationWarehouseId) {
      throw new BadRequestException('Source and destination warehouses must be different');
    }

    // Validate source warehouse exists
    const sourceWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.sourceWarehouseId },
    });
    if (!sourceWarehouse) {
      throw new NotFoundException(`Source warehouse with ID ${dto.sourceWarehouseId} not found`);
    }

    // Validate destination warehouse exists
    const destWarehouse = await this.prisma.warehouse.findUnique({
      where: { id: dto.destinationWarehouseId },
    });
    if (!destWarehouse) {
      throw new NotFoundException(`Destination warehouse with ID ${dto.destinationWarehouseId} not found`);
    }

    // Validate all items exist and belong to source warehouse
    for (const item of dto.items) {
      const inventoryItem = await this.prisma.inventoryItem.findUnique({
        where: { id: item.inventoryItemId },
      });

      if (!inventoryItem) {
        throw new NotFoundException(`Inventory item with ID ${item.inventoryItemId} not found`);
      }

      if (inventoryItem.warehouseId !== dto.sourceWarehouseId) {
        throw new BadRequestException(
          `Item ${inventoryItem.name} does not belong to source warehouse`
        );
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
      include: {
        sourceWarehouse: true,
        destinationWarehouse: true,
        requestedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            inventoryItem: true,
          },
        },
      },
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
        include: {
          sourceWarehouse: true,
          destinationWarehouse: true,
          requestedBy: { select: { id: true, name: true, email: true } },
          approvedBy: { select: { id: true, name: true, email: true } },
          items: {
            include: {
              inventoryItem: true,
            },
          },
        },
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
      include: {
        sourceWarehouse: true,
        destinationWarehouse: true,
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            inventoryItem: {
              include: {
                warehouse: true,
              },
            },
          },
        },
      },
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

    // Verify items still have sufficient quantity
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
      include: {
        sourceWarehouse: true,
        destinationWarehouse: true,
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        items: { include: { inventoryItem: true } },
      },
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
      include: {
        sourceWarehouse: true,
        destinationWarehouse: true,
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        items: { include: { inventoryItem: true } },
      },
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

  async complete(id: string, completedById: string) {
    const request = await this.findOne(id);

    if (request.status !== RequestStatus.APPROVED) {
      throw new BadRequestException(`Transfer request must be approved first. Current status: ${request.status}`);
    }

    // Execute the transfer - update inventory quantities
    for (const item of request.items) {
      // Decrease quantity in source warehouse
      await this.prisma.inventoryItem.update({
        where: { id: item.inventoryItemId },
        data: {
          quantity: { decrement: item.quantity },
        },
      });

      // Check if item exists in destination warehouse or create/update
      const existingInDest = await this.prisma.inventoryItem.findFirst({
        where: {
          warehouseId: request.destinationWarehouseId,
          name: item.inventoryItem.name,
          category: item.inventoryItem.category,
          sku: item.inventoryItem.sku,
        },
      });

      if (existingInDest) {
        // Update existing item in destination
        await this.prisma.inventoryItem.update({
          where: { id: existingInDest.id },
          data: {
            quantity: { increment: item.quantity },
          },
        });
      } else {
        // Create new item in destination warehouse
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
      data: {
        status: RequestStatus.COMPLETED,
      },
      include: {
        sourceWarehouse: true,
        destinationWarehouse: true,
        requestedBy: { select: { id: true, name: true, email: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
        items: { include: { inventoryItem: true } },
      },
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
      data: {
        status: RequestStatus.CANCELLED,
      },
      include: {
        sourceWarehouse: true,
        destinationWarehouse: true,
        requestedBy: { select: { id: true, name: true, email: true } },
        items: { include: { inventoryItem: true } },
      },
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
    const [total, pending, approved, rejected, completed, cancelled] = await Promise.all([
      this.prisma.transferRequest.count(),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.PENDING } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.APPROVED } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.REJECTED } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.COMPLETED } }),
      this.prisma.transferRequest.count({ where: { status: RequestStatus.CANCELLED } }),
    ]);

    return {
      total,
      byStatus: {
        pending,
        approved,
        rejected,
        completed,
        cancelled,
      },
    };
  }
}
