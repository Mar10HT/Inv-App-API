import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { FilterInventoryDto } from './dto/filter-inventory.dto';
import { PaginatedResponseDto } from './dto/paginated-response.dto';
import { StatsResponseDto } from './dto/stats-response.dto';
import { InventoryItem, InventoryStatus, ItemType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async create(createInventoryDto: CreateInventoryDto): Promise<InventoryItem> {
    // Validate warehouse exists
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: createInventoryDto.warehouseId },
    });
    if (!warehouse) {
      throw new NotFoundException(`Warehouse with ID ${createInventoryDto.warehouseId} not found`);
    }

    // Validate supplier if provided
    if (createInventoryDto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({
        where: { id: createInventoryDto.supplierId },
      });
      if (!supplier) {
        throw new NotFoundException(`Supplier with ID ${createInventoryDto.supplierId} not found`);
      }
    }

    // Validate assigned user if provided
    if (createInventoryDto.assignedToUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: createInventoryDto.assignedToUserId },
      });
      if (!user) {
        throw new NotFoundException(`User with ID ${createInventoryDto.assignedToUserId} not found`);
      }
    }

    const itemType = createInventoryDto.itemType || ItemType.BULK;

    // Validate UNIQUE item requirements
    if (itemType === ItemType.UNIQUE) {
      if (createInventoryDto.quantity !== 1) {
        throw new BadRequestException('UNIQUE items must have quantity of 1');
      }
      if (!createInventoryDto.serviceTag && !createInventoryDto.serialNumber) {
        throw new BadRequestException('UNIQUE items must have either serviceTag or serialNumber');
      }
      if (createInventoryDto.assignedToUserId) {
        // Set assignedAt timestamp when assigning
        createInventoryDto['assignedAt'] = new Date();
      }
    }

    // Validate BULK item requirements
    if (itemType === ItemType.BULK) {
      if (createInventoryDto.serviceTag || createInventoryDto.serialNumber) {
        throw new BadRequestException('BULK items cannot have serviceTag or serialNumber');
      }
      if (createInventoryDto.assignedToUserId) {
        throw new BadRequestException('BULK items cannot be assigned to users');
      }
    }

    // Check if SKU already exists
    if (createInventoryDto.sku) {
      const existing = await this.prisma.inventoryItem.findUnique({
        where: { sku: createInventoryDto.sku },
      });
      if (existing) {
        throw new ConflictException(`Item with SKU ${createInventoryDto.sku} already exists`);
      }
    }

    // Check if serviceTag already exists
    if (createInventoryDto.serviceTag) {
      const existing = await this.prisma.inventoryItem.findUnique({
        where: { serviceTag: createInventoryDto.serviceTag },
      });
      if (existing) {
        throw new ConflictException(`Item with service tag ${createInventoryDto.serviceTag} already exists`);
      }
    }

    // Auto-calculate status based on quantity if not provided
    let status = createInventoryDto.status;
    if (!status) {
      const minQty = createInventoryDto.minQuantity || 10;
      if (createInventoryDto.quantity === 0) {
        status = InventoryStatus.OUT_OF_STOCK;
      } else if (createInventoryDto.quantity <= minQty) {
        status = InventoryStatus.LOW_STOCK;
      } else {
        status = InventoryStatus.IN_STOCK;
      }
    }

    return this.prisma.inventoryItem.create({
      data: {
        ...createInventoryDto,
        itemType,
        status,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        warehouse: true,
        supplier: true,
        assignedToUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    });
  }

  async findAll(filters?: FilterInventoryDto): Promise<PaginatedResponseDto<InventoryItem>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {};

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
        { sku: { contains: filters.search, mode: 'insensitive' } },
        { serviceTag: { contains: filters.search, mode: 'insensitive' } },
        { serialNumber: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    if (filters?.itemType) {
      where.itemType = filters.itemType;
    }

    if (filters?.currency) {
      where.currency = filters.currency;
    }

    if (filters?.warehouseId) {
      where.warehouseId = filters.warehouseId;
    }

    if (filters?.supplierId) {
      where.supplierId = filters.supplierId;
    }

    if (filters?.assignedToUserId) {
      where.assignedToUserId = filters.assignedToUserId;
    }

    // Build orderBy
    const orderBy: any = {};
    const sortBy = filters?.sortBy || 'createdAt';
    const sortOrder = filters?.sortOrder || 'desc';
    orderBy[sortBy] = sortOrder;

    const [items, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          warehouse: true,
          supplier: true,
          assignedToUser: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return new PaginatedResponseDto(items, total, page, limit);
  }

  async findOne(id: string): Promise<InventoryItem> {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        warehouse: true,
        supplier: true,
        assignedToUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!item) {
      throw new NotFoundException(`Inventory item with ID ${id} not found`);
    }

    return item;
  }

  async update(id: string, updateInventoryDto: UpdateInventoryDto): Promise<InventoryItem> {
    // Check if item exists
    await this.findOne(id);

    // Check if SKU is being updated and already exists
    if (updateInventoryDto.sku) {
      const existing = await this.prisma.inventoryItem.findFirst({
        where: {
          sku: updateInventoryDto.sku,
          NOT: { id },
        },
      });
      if (existing) {
        throw new ConflictException(`Item with SKU ${updateInventoryDto.sku} already exists`);
      }
    }

    // Auto-update status if quantity is being updated
    let status = updateInventoryDto.status;
    if (updateInventoryDto.quantity !== undefined && !status) {
      const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
      if (!item) {
        throw new NotFoundException(`Inventory item with ID ${id} not found`);
      }
      const minQty = updateInventoryDto.minQuantity || item.minQuantity;

      if (updateInventoryDto.quantity === 0) {
        status = InventoryStatus.OUT_OF_STOCK;
      } else if (updateInventoryDto.quantity <= minQty) {
        status = InventoryStatus.LOW_STOCK;
      } else {
        status = InventoryStatus.IN_STOCK;
      }
    }

    return this.prisma.inventoryItem.update({
      where: { id },
      data: {
        ...updateInventoryDto,
        ...(status && { status }),
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async remove(id: string): Promise<void> {
    // Check if item exists
    await this.findOne(id);

    await this.prisma.inventoryItem.delete({
      where: { id },
    });
  }

  async getStats(): Promise<StatsResponseDto> {
    const [
      total,
      inStock,
      lowStock,
      outOfStock,
      items,
      categoryStats,
      locationStats,
    ] = await Promise.all([
      this.prisma.inventoryItem.count(),
      this.prisma.inventoryItem.count({ where: { status: InventoryStatus.IN_STOCK } }),
      this.prisma.inventoryItem.count({ where: { status: InventoryStatus.LOW_STOCK } }),
      this.prisma.inventoryItem.count({ where: { status: InventoryStatus.OUT_OF_STOCK } }),
      this.prisma.inventoryItem.findMany({ select: { price: true, quantity: true } }),
      this.prisma.inventoryItem.groupBy({
        by: ['category'],
        _count: { category: true },
      }),
      this.prisma.inventoryItem.groupBy({
        by: ['location'],
        _count: { location: true },
      }),
    ]);

    const totalValue = items.reduce((sum, item) => {
      return sum + (item.price || 0) * item.quantity;
    }, 0);

    return {
      total,
      inStock,
      lowStock,
      outOfStock,
      totalValue,
      categories: categoryStats.map(stat => ({
        name: stat.category,
        count: stat._count.category,
      })),
      locations: locationStats.map(stat => ({
        name: stat.location,
        count: stat._count.location,
      })),
    };
  }

  async getLowStockItems(): Promise<InventoryItem[]> {
    return this.prisma.inventoryItem.findMany({
      where: {
        OR: [
          { status: InventoryStatus.LOW_STOCK },
          { status: InventoryStatus.OUT_OF_STOCK },
        ],
      },
      orderBy: { quantity: 'asc' },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async getCategories(): Promise<string[]> {
    const categories = await this.prisma.inventoryItem.findMany({
      distinct: ['category'],
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    return categories.map(c => c.category);
  }

  async getLocations(): Promise<string[]> {
    const locations = await this.prisma.inventoryItem.findMany({
      distinct: ['location'],
      select: { location: true },
      orderBy: { location: 'asc' },
    });
    return locations.map(l => l.location);
  }
}
