import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QrService } from '../qr/qr.service';
import { CreateDischargeRequestDto } from './dto/create-discharge-request.dto';
import { FilterDischargeRequestDto } from './dto/filter-discharge-request.dto';
import { DischargeRequestStatus } from '@prisma/client';
import { warehouseFilter } from '../common/warehouse-access/warehouse-filter.util';

@Injectable()
export class DischargeRequestsService {
  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    private qrService: QrService,
  ) {}

  private readonly includeLight = {
    warehouse: { select: { id: true, name: true } },
    resolvedBy: { select: { id: true, name: true, email: true } },
    items: {
      include: {
        inventoryItem: { select: { id: true, name: true, serviceTag: true, quantity: true } },
      },
    },
  };

  private readonly includeFull = {
    warehouse: true,
    resolvedBy: { select: { id: true, name: true, email: true } },
    items: {
      include: {
        inventoryItem: { include: { warehouse: true } },
      },
    },
  };

  /**
   * Create discharge request(s) from public form.
   * Receives a flat items array, groups by warehouse, creates N requests in a transaction.
   */
  async createFromPublicForm(dto: CreateDischargeRequestDto) {
    // Validate all items exist and have sufficient quantity
    const itemDetails = await Promise.all(
      dto.items.map(async (item) => {
        const inventoryItem = await this.prisma.inventoryItem.findUnique({
          where: { id: item.inventoryItemId },
          include: { warehouse: true },
        });

        if (!inventoryItem) {
          throw new NotFoundException('Inventory item not found');
        }

        if (inventoryItem.quantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient quantity for item ${inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${item.quantity}`,
          );
        }

        return {
          ...item,
          warehouseId: inventoryItem.warehouseId,
          itemName: inventoryItem.name,
        };
      }),
    );

    // Group items by warehouse
    const groupedByWarehouse = new Map<string, typeof itemDetails>();
    for (const item of itemDetails) {
      const existing = groupedByWarehouse.get(item.warehouseId) || [];
      existing.push(item);
      groupedByWarehouse.set(item.warehouseId, existing);
    }

    // Create N discharge requests in a transaction (one per warehouse)
    const createdRequests = await this.prisma.$transaction(async (tx) => {
      const requests: any[] = [];

      for (const [warehouseId, items] of groupedByWarehouse) {
        const request = await tx.dischargeRequest.create({
          data: {
            requesterName: dto.requesterName,
            requesterPosition: dto.requesterPosition,
            requesterPhone: dto.requesterPhone,
            neededByDate: dto.neededByDate ? new Date(dto.neededByDate) : null,
            justification: dto.justification,
            warehouseId,
            items: {
              create: items.map((item) => ({
                inventoryItemId: item.inventoryItemId,
                quantity: item.quantity,
              })),
            },
          },
          include: this.includeFull,
        });

        requests.push(request);
      }

      return requests;
    });

    // Audit log for each created request
    for (const request of createdRequests) {
      await this.auditService.log({
        action: 'CREATE',
        entity: 'DischargeRequest',
        entityId: request.id,
        changes: {
          status: 'PENDING',
          requesterName: dto.requesterName,
          itemCount: request.items.length,
          warehouseId: request.warehouseId,
        },
      });
    }

    return {
      requestsCreated: createdRequests.length,
      requests: createdRequests,
    };
  }

  /**
   * Get all inventory items with qty > 0 (for public form dropdown)
   */
  async getAvailableItems() {
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        quantity: { gt: 0 },
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        quantity: true,
        category: true,
        itemType: true,
        serviceTag: true,
        warehouseId: true,
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    return items;
  }

  /**
   * Find all discharge requests with filters and pagination
   */
  async findAll(filters: FilterDischargeRequestDto, warehouseIds?: string[] | null) {
    const page = filters.page || 1;
    const limit = filters.limit || 10;
    const skip = (page - 1) * limit;

    const where: any = {
      ...warehouseFilter(warehouseIds),
    };
    if (filters.status) {
      where.status = filters.status;
    }
    if (filters.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }

    const [requests, total] = await Promise.all([
      this.prisma.dischargeRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.includeLight,
      }),
      this.prisma.dischargeRequest.count({ where }),
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

  /**
   * Find a single discharge request by ID
   */
  async findOne(id: string) {
    const request = await this.prisma.dischargeRequest.findUnique({
      where: { id },
      include: this.includeFull,
    });

    if (!request) {
      throw new NotFoundException('Discharge request not found');
    }

    return request;
  }

  /**
   * Complete a discharge request - decrement inventory and set COMPLETED
   */
  async complete(id: string, resolvedById: string) {
    const request = await this.findOne(id);

    if (request.status !== DischargeRequestStatus.PENDING) {
      throw new BadRequestException(
        `Discharge request is not pending. Current status: ${request.status}`,
      );
    }

    // Validate and decrement inventory in a single transaction to prevent race conditions
    const updated = await this.prisma.$transaction(async (tx) => {
      // Validate all items exist, are not soft-deleted, and have sufficient quantity
      const inventoryItems = await Promise.all(
        request.items.map((item) =>
          tx.inventoryItem.findFirst({
            where: { id: item.inventoryItemId, deletedAt: null },
          }),
        ),
      );

      for (let i = 0; i < request.items.length; i++) {
        const inventoryItem = inventoryItems[i];
        const requestItem = request.items[i];
        if (!inventoryItem) {
          throw new BadRequestException(
            `Item ${requestItem.inventoryItem.name} is no longer available`,
          );
        }
        if (inventoryItem.quantity < requestItem.quantity) {
          throw new BadRequestException(
            `Insufficient quantity for item ${requestItem.inventoryItem.name}. Available: ${inventoryItem.quantity}, Requested: ${requestItem.quantity}`,
          );
        }
      }

      // Decrement all inventory quantities in parallel
      await Promise.all(
        request.items.map((item) =>
          tx.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { quantity: { decrement: item.quantity } },
          }),
        ),
      );

      return tx.dischargeRequest.update({
        where: { id },
        data: {
          status: DischargeRequestStatus.COMPLETED,
          resolvedById,
          resolvedAt: new Date(),
        },
        include: this.includeFull,
      });
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'DischargeRequest',
      entityId: id,
      userId: resolvedById,
      changes: { status: 'COMPLETED', itemsDelivered: request.items.length },
    });

    return updated;
  }

  /**
   * Reject a discharge request
   */
  async reject(id: string, resolvedById: string, reason?: string) {
    const request = await this.findOne(id);

    if (request.status !== DischargeRequestStatus.PENDING) {
      throw new BadRequestException(
        `Discharge request is not pending. Current status: ${request.status}`,
      );
    }

    const updated = await this.prisma.dischargeRequest.update({
      where: { id },
      data: {
        status: DischargeRequestStatus.REJECTED,
        resolvedById,
        resolvedAt: new Date(),
        rejectedReason: reason,
      },
      include: this.includeFull,
    });

    await this.auditService.log({
      action: 'UPDATE',
      entity: 'DischargeRequest',
      entityId: id,
      userId: resolvedById,
      changes: { status: 'REJECTED', reason },
    });

    return updated;
  }

  /**
   * Get stats - count by status
   */
  async getStats(warehouseIds?: string[] | null) {
    const wFilter = warehouseFilter(warehouseIds);

    const [total, pending, completed, rejected] = await Promise.all([
      this.prisma.dischargeRequest.count({ where: { ...wFilter } }),
      this.prisma.dischargeRequest.count({ where: { status: DischargeRequestStatus.PENDING, ...wFilter } }),
      this.prisma.dischargeRequest.count({ where: { status: DischargeRequestStatus.COMPLETED, ...wFilter } }),
      this.prisma.dischargeRequest.count({ where: { status: DischargeRequestStatus.REJECTED, ...wFilter } }),
    ]);

    return {
      total,
      byStatus: { pending, completed, rejected },
    };
  }

  /**
   * Generate QR code for the public request form URL
   */
  async getRequestFormQr() {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const requestFormUrl = `${frontendUrl}/request`;
    const qrDataUrl = await this.qrService.generateUrlQrDataUrl(requestFormUrl);
    return { url: requestFormUrl, qrDataUrl };
  }
}
