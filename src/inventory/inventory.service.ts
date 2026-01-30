import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { FilterInventoryDto } from './dto/filter-inventory.dto';
import { PaginatedResponseDto } from './dto/paginated-response.dto';
import { StatsResponseDto } from './dto/stats-response.dto';
import {
  BulkUpdateDto,
  BulkDeleteDto,
  BulkImportDto,
  BulkOperationResultDto,
} from './dto/bulk-operations.dto';
import { InventoryItem, InventoryStatus, ItemType } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { SearchService } from '../common/search/search.service';

@Injectable()
export class InventoryService {
  private readonly CACHE_KEYS = {
    STATS: 'inventory:stats',
    CATEGORIES: 'inventory:categories',
    LOCATIONS: 'inventory:locations',
  };

  constructor(
    private prisma: PrismaService,
    private auditService: AuditService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private eventsService: EventsService,
    private searchService: SearchService,
  ) {}

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

    const item = await this.prisma.inventoryItem.create({
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

    // Log audit
    await this.auditService.log({
      action: 'CREATE',
      entity: 'InventoryItem',
      entityId: item.id,
      userId: createInventoryDto.createdById,
      changes: { after: { name: item.name, quantity: item.quantity, category: item.category } },
    });

    // Invalidate cache
    await this.invalidateCache();

    // Emit WebSocket event
    this.eventsService.emitInventoryChange('created', item.id, { name: item.name });

    // Sync FTS index
    this.searchService.syncItem(item.id).catch(() => {});

    return item;
  }

  async findAll(filters?: FilterInventoryDto): Promise<PaginatedResponseDto<InventoryItem>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    // Build where clause - always exclude soft-deleted items
    const where: any = {
      deletedAt: null,
    };

    if (filters?.search) {
      // Try FTS first for better performance
      const ftsIds = await this.searchService.searchInventory(filters.search);
      if (ftsIds.length > 0) {
        where.id = { in: ftsIds };
      } else {
        // Fallback to LIKE-style search via Prisma
        where.OR = [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          { sku: { contains: filters.search, mode: 'insensitive' } },
          { serviceTag: { contains: filters.search, mode: 'insensitive' } },
          { serialNumber: { contains: filters.search, mode: 'insensitive' } },
        ];
      }
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

    const updatedItem = await this.prisma.inventoryItem.update({
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

    // Invalidate cache
    await this.invalidateCache();

    // Emit WebSocket event
    this.eventsService.emitInventoryChange('updated', id);

    // Sync FTS index
    this.searchService.syncItem(id).catch(() => {});

    return updatedItem;
  }

  async remove(id: string): Promise<void> {
    // Check if item exists
    await this.findOne(id);

    // Soft delete: set deletedAt timestamp instead of hard delete
    await this.prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    // Invalidate cache
    await this.invalidateCache();

    // Emit WebSocket event
    this.eventsService.emitInventoryChange('deleted', id);

    // Remove from FTS index
    this.searchService.removeItem(id).catch(() => {});
  }

  async restore(id: string): Promise<InventoryItem> {
    // Restore a soft-deleted item
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
    });

    if (!item) {
      throw new NotFoundException(`Inventory item with ID ${id} not found`);
    }

    if (!item.deletedAt) {
      throw new BadRequestException('Item is not deleted');
    }

    const restoredItem = await this.prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: null },
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
      },
    });

    // Invalidate cache
    await this.invalidateCache();

    return restoredItem;
  }

  async getStats(): Promise<StatsResponseDto> {
    // Check cache first
    const cachedStats = await this.cacheManager.get<StatsResponseDto>(this.CACHE_KEYS.STATS);
    if (cachedStats) {
      return cachedStats;
    }

    // Optimized query: fetch all warehouses with their item counts in one query
    const [
      total,
      inStock,
      lowStock,
      outOfStock,
      items,
      categoryStats,
      warehousesWithCounts,
    ] = await Promise.all([
      this.prisma.inventoryItem.count({ where: { deletedAt: null } }),
      this.prisma.inventoryItem.count({ where: { status: InventoryStatus.IN_STOCK, deletedAt: null } }),
      this.prisma.inventoryItem.count({ where: { status: InventoryStatus.LOW_STOCK, deletedAt: null } }),
      this.prisma.inventoryItem.count({ where: { status: InventoryStatus.OUT_OF_STOCK, deletedAt: null } }),
      this.prisma.inventoryItem.findMany({
        where: { deletedAt: null },
        select: { price: true, quantity: true }
      }),
      this.prisma.inventoryItem.groupBy({
        by: ['category'],
        where: { deletedAt: null },
        _count: { category: true },
      }),
      // Optimized: Fetch warehouses with item count using include
      this.prisma.warehouse.findMany({
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              inventoryItems: {
                where: { deletedAt: null },
              },
            },
          },
        },
      }),
    ]);

    const totalValue = items.reduce((sum, item) => {
      return sum + (item.price || 0) * item.quantity;
    }, 0);

    // No need for extra query - warehouse counts are already included
    const locationStats = warehousesWithCounts.map(warehouse => ({
      name: warehouse.name || 'Unknown',
      count: warehouse._count.inventoryItems,
    }));

    const stats: StatsResponseDto = {
      total,
      inStock,
      lowStock,
      outOfStock,
      totalValue,
      categories: categoryStats.map(stat => ({
        name: stat.category,
        count: stat._count.category,
      })),
      locations: locationStats,
    };

    // Cache the stats for 60 seconds
    await this.cacheManager.set(this.CACHE_KEYS.STATS, stats, 60000);

    return stats;
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
    // Check cache first
    const cachedCategories = await this.cacheManager.get<string[]>(this.CACHE_KEYS.CATEGORIES);
    if (cachedCategories) {
      return cachedCategories;
    }

    const categories = await this.prisma.inventoryItem.findMany({
      distinct: ['category'],
      where: { deletedAt: null },
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    const result = categories.map(c => c.category);

    // Cache for 5 minutes
    await this.cacheManager.set(this.CACHE_KEYS.CATEGORIES, result, 300000);

    return result;
  }

  async getLocations(): Promise<string[]> {
    // Check cache first
    const cachedLocations = await this.cacheManager.get<string[]>(this.CACHE_KEYS.LOCATIONS);
    if (cachedLocations) {
      return cachedLocations;
    }

    const warehouses = await this.prisma.warehouse.findMany({
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    const result = warehouses.map(w => w.name);

    // Cache for 5 minutes
    await this.cacheManager.set(this.CACHE_KEYS.LOCATIONS, result, 300000);

    return result;
  }

  // Cache invalidation method
  async invalidateCache(): Promise<void> {
    await Promise.all([
      this.cacheManager.del(this.CACHE_KEYS.STATS),
      this.cacheManager.del(this.CACHE_KEYS.CATEGORIES),
      this.cacheManager.del(this.CACHE_KEYS.LOCATIONS),
    ]);
  }

  // Bulk Operations

  async bulkUpdate(dto: BulkUpdateDto, userId?: string): Promise<BulkOperationResultDto> {
    const result: BulkOperationResultDto = {
      success: 0,
      failed: 0,
      errors: [],
      updatedIds: [],
    };

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      try {
        // Check if item exists
        const existing = await this.prisma.inventoryItem.findUnique({
          where: { id: item.id },
        });

        if (!existing) {
          result.failed++;
          result.errors.push({
            index: i,
            id: item.id,
            error: `Item with ID ${item.id} not found`,
          });
          continue;
        }

        // Check SKU conflict
        if (item.warehouseId) {
          const warehouse = await this.prisma.warehouse.findUnique({
            where: { id: item.warehouseId },
          });
          if (!warehouse) {
            result.failed++;
            result.errors.push({
              index: i,
              id: item.id,
              error: `Warehouse with ID ${item.warehouseId} not found`,
            });
            continue;
          }
        }

        // Auto-update status if quantity is being updated
        let status = item.status;
        if (item.quantity !== undefined && !status) {
          const minQty = item.minQuantity || existing.minQuantity;
          if (item.quantity === 0) {
            status = InventoryStatus.OUT_OF_STOCK;
          } else if (item.quantity <= minQty) {
            status = InventoryStatus.LOW_STOCK;
          } else {
            status = InventoryStatus.IN_STOCK;
          }
        }

        // Remove id from update data
        const { id, ...updateData } = item;

        await this.prisma.inventoryItem.update({
          where: { id: item.id },
          data: {
            ...updateData,
            ...(status && { status }),
          },
        });

        // Log audit
        await this.auditService.log({
          action: 'UPDATE',
          entity: 'InventoryItem',
          entityId: item.id,
          userId,
          changes: { bulk: true, fields: Object.keys(updateData) },
        });

        result.success++;
        result.updatedIds!.push(item.id);
      } catch (error) {
        result.failed++;
        result.errors.push({
          index: i,
          id: item.id,
          error: error.message || 'Unknown error',
        });
      }
    }

    // Invalidate cache if any updates were successful
    if (result.success > 0) {
      await this.invalidateCache();
      this.eventsService.emitInventoryChange('bulk_updated', undefined, { count: result.success });
    }

    return result;
  }

  async bulkDelete(dto: BulkDeleteDto, userId?: string): Promise<BulkOperationResultDto> {
    const result: BulkOperationResultDto = {
      success: 0,
      failed: 0,
      errors: [],
      deletedIds: [],
    };

    for (let i = 0; i < dto.ids.length; i++) {
      const id = dto.ids[i];
      try {
        // Check if item exists
        const existing = await this.prisma.inventoryItem.findUnique({
          where: { id },
        });

        if (!existing) {
          result.failed++;
          result.errors.push({
            index: i,
            id,
            error: `Item with ID ${id} not found`,
          });
          continue;
        }

        // Soft delete
        await this.prisma.inventoryItem.update({
          where: { id },
          data: { deletedAt: new Date() },
        });

        // Log audit
        await this.auditService.log({
          action: 'DELETE',
          entity: 'InventoryItem',
          entityId: id,
          userId,
          changes: { bulk: true, reason: dto.reason },
        });

        result.success++;
        result.deletedIds!.push(id);
      } catch (error) {
        result.failed++;
        result.errors.push({
          index: i,
          id,
          error: error.message || 'Unknown error',
        });
      }
    }

    // Invalidate cache if any deletes were successful
    if (result.success > 0) {
      await this.invalidateCache();
      this.eventsService.emitInventoryChange('bulk_deleted', undefined, { count: result.success });
    }

    return result;
  }

  async bulkImport(dto: BulkImportDto): Promise<BulkOperationResultDto> {
    const result: BulkOperationResultDto = {
      success: 0,
      failed: 0,
      errors: [],
      createdIds: [],
    };

    for (let i = 0; i < dto.items.length; i++) {
      const item = dto.items[i];
      try {
        // Validate warehouse exists
        const warehouse = await this.prisma.warehouse.findUnique({
          where: { id: item.warehouseId },
        });
        if (!warehouse) {
          result.failed++;
          result.errors.push({
            index: i,
            error: `Warehouse with ID ${item.warehouseId} not found`,
          });
          continue;
        }

        // Check if SKU already exists
        if (item.sku) {
          const existing = await this.prisma.inventoryItem.findUnique({
            where: { sku: item.sku },
          });
          if (existing) {
            result.failed++;
            result.errors.push({
              index: i,
              error: `Item with SKU ${item.sku} already exists`,
            });
            continue;
          }
        }

        // Check if serviceTag already exists
        if (item.serviceTag) {
          const existing = await this.prisma.inventoryItem.findUnique({
            where: { serviceTag: item.serviceTag },
          });
          if (existing) {
            result.failed++;
            result.errors.push({
              index: i,
              error: `Item with service tag ${item.serviceTag} already exists`,
            });
            continue;
          }
        }

        // Auto-calculate status
        const minQty = item.minQuantity || 10;
        let status: InventoryStatus;
        if (item.quantity === 0) {
          status = InventoryStatus.OUT_OF_STOCK;
        } else if (item.quantity <= minQty) {
          status = InventoryStatus.LOW_STOCK;
        } else {
          status = InventoryStatus.IN_STOCK;
        }

        const created = await this.prisma.inventoryItem.create({
          data: {
            ...item,
            status,
            itemType: item.itemType || ItemType.BULK,
            createdById: dto.createdById,
          },
        });

        // Log audit
        await this.auditService.log({
          action: 'CREATE',
          entity: 'InventoryItem',
          entityId: created.id,
          userId: dto.createdById,
          changes: { bulk: true, name: item.name },
        });

        result.success++;
        result.createdIds!.push(created.id);
      } catch (error) {
        result.failed++;
        result.errors.push({
          index: i,
          error: error.message || 'Unknown error',
        });
      }
    }

    // Invalidate cache if any imports were successful
    if (result.success > 0) {
      await this.invalidateCache();
      this.eventsService.emitInventoryChange('imported', undefined, { count: result.success });
    }

    return result;
  }

  async parseExcelFile(buffer: Buffer): Promise<BulkImportDto['items']> {
    // Dynamic import for exceljs
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('Excel file has no worksheets');
    }

    const items: BulkImportDto['items'] = [];
    const headers: string[] = [];

    // Get headers from first row
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value?.toString().toLowerCase().trim() || '';
    });

    // Parse data rows
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      const item: any = {};
      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber];
        let value = cell.value;

        // Handle formula cells
        if (typeof value === 'object' && value !== null && 'result' in value) {
          value = value.result;
        }

        switch (header) {
          case 'name':
          case 'nombre':
            item.name = value?.toString();
            break;
          case 'description':
          case 'descripcion':
            item.description = value?.toString();
            break;
          case 'quantity':
          case 'cantidad':
            item.quantity = Number(value) || 0;
            break;
          case 'minquantity':
          case 'min_quantity':
          case 'cantidadminima':
            item.minQuantity = Number(value) || 10;
            break;
          case 'category':
          case 'categoria':
            item.category = value?.toString();
            break;
          case 'price':
          case 'precio':
            item.price = Number(value) || undefined;
            break;
          case 'currency':
          case 'moneda':
            item.currency = value?.toString().toUpperCase() === 'HNL' ? 'HNL' : 'USD';
            break;
          case 'sku':
            item.sku = value?.toString();
            break;
          case 'barcode':
          case 'codigobarras':
            item.barcode = value?.toString();
            break;
          case 'itemtype':
          case 'tipo':
            item.itemType = value?.toString().toUpperCase() === 'UNIQUE' ? 'UNIQUE' : 'BULK';
            break;
          case 'servicetag':
          case 'service_tag':
            item.serviceTag = value?.toString();
            break;
          case 'serialnumber':
          case 'serial_number':
          case 'numeroserie':
            item.serialNumber = value?.toString();
            break;
          case 'warehouseid':
          case 'warehouse_id':
          case 'almacen':
            item.warehouseId = value?.toString();
            break;
          case 'supplierid':
          case 'supplier_id':
          case 'proveedor':
            item.supplierId = value?.toString();
            break;
        }
      });

      // Only add if required fields are present
      if (item.name && item.category && item.warehouseId) {
        item.quantity = item.quantity || 0;
        items.push(item);
      }
    });

    return items;
  }
}
