import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
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
import { InventoryItem, InventoryStatus, ItemType, Prisma } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { SearchService } from '../common/search/search.service';
import { warehouseFilter } from '../common/warehouse-access/warehouse-filter.util';

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
      throw new NotFoundException('Warehouse not found');
    }

    // Validate supplier if provided
    if (createInventoryDto.supplierId) {
      const supplier = await this.prisma.supplier.findUnique({
        where: { id: createInventoryDto.supplierId },
      });
      if (!supplier) {
        throw new NotFoundException('Supplier not found');
      }
    }

    // Validate assigned user if provided
    if (createInventoryDto.assignedToUserId) {
      const user = await this.prisma.user.findUnique({
        where: { id: createInventoryDto.assignedToUserId },
      });
      if (!user) {
        throw new NotFoundException('Assigned user not found');
      }
    }

    const itemType = createInventoryDto.itemType || ItemType.BULK;

    // Validate UNIQUE item requirements
    if (itemType === ItemType.UNIQUE) {
      if (createInventoryDto.quantity !== 0 && createInventoryDto.quantity !== 1) {
        throw new BadRequestException('UNIQUE items must have quantity of 0 or 1');
      }
      if (!createInventoryDto.serviceTag && !createInventoryDto.serialNumber) {
        throw new BadRequestException('UNIQUE items must have either serviceTag or serialNumber');
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

    // Auto-calculate status based on quantity and assignment
    let status = createInventoryDto.status;
    if (!status) {
      // UNIQUE items: IN_USE if assigned, otherwise IN_STOCK (qty=1) or OUT_OF_STOCK (qty=0)
      if (itemType === ItemType.UNIQUE) {
        if (createInventoryDto.assignedToUserId) {
          status = InventoryStatus.IN_USE;
        } else {
          status = createInventoryDto.quantity === 1 ? InventoryStatus.IN_STOCK : InventoryStatus.OUT_OF_STOCK;
        }
      }
      // BULK items: IN_STOCK, LOW_STOCK, or OUT_OF_STOCK based on quantity and minQuantity
      else {
        const minQty = createInventoryDto.minQuantity || 10;
        if (createInventoryDto.quantity === 0) {
          status = InventoryStatus.OUT_OF_STOCK;
        } else if (createInventoryDto.quantity <= minQty) {
          status = InventoryStatus.LOW_STOCK;
        } else {
          status = InventoryStatus.IN_STOCK;
        }
      }
    }

    const item = await this.prisma.inventoryItem.create({
      data: {
        ...createInventoryDto,
        itemType,
        status,
        ...(itemType === ItemType.UNIQUE && createInventoryDto.assignedToUserId
          ? { assignedAt: new Date() }
          : {}),
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

  async findAll(filters?: FilterInventoryDto, warehouseIds?: string[] | null): Promise<PaginatedResponseDto<InventoryItem>> {
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    // Build where clause - always exclude soft-deleted items
    const where: Prisma.InventoryItemWhereInput = {
      deletedAt: null,
      ...warehouseFilter(warehouseIds),
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
    const sortBy = filters?.sortBy || 'createdAt';
    const sortOrder = filters?.sortOrder || 'desc';
    const orderBy: Record<string, 'asc' | 'desc'> = { [sortBy]: sortOrder };

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
      throw new NotFoundException('Inventory item not found');
    }

    return item;
  }

  async update(id: string, updateInventoryDto: UpdateInventoryDto, userId?: string): Promise<InventoryItem> {
    // Capture item before update for audit log
    const oldItem = await this.findOne(id);

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

    // Auto-update status if quantity or assignment is being updated
    let status = updateInventoryDto.status;
    if ((updateInventoryDto.quantity !== undefined || updateInventoryDto.assignedToUserId !== undefined) && !status) {
      const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
      if (!item) {
        throw new NotFoundException('Inventory item not found');
      }
      const quantity = updateInventoryDto.quantity ?? item.quantity;
      const minQty = updateInventoryDto.minQuantity ?? item.minQuantity;
      const assignedToUserId = updateInventoryDto.assignedToUserId !== undefined
        ? updateInventoryDto.assignedToUserId
        : item.assignedToUserId;

      if (item.itemType === ItemType.UNIQUE && assignedToUserId) {
        status = InventoryStatus.IN_USE;
      } else if (quantity === 0) {
        status = InventoryStatus.OUT_OF_STOCK;
      } else if (quantity <= minQty) {
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

    // Log audit with before/after
    await this.auditService.log({
      action: 'UPDATE',
      entity: 'InventoryItem',
      entityId: id,
      userId,
      changes: {
        before: { name: oldItem.name, quantity: oldItem.quantity, category: oldItem.category, status: oldItem.status },
        after: { name: updatedItem.name, quantity: updatedItem.quantity, category: updatedItem.category, status: updatedItem.status },
        fields: Object.keys(updateInventoryDto),
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
      throw new NotFoundException('Inventory item not found');
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

  async getStats(warehouseIds?: string[] | null): Promise<StatsResponseDto> {
    // Skip cache when filtering by warehouse (per-user)
    if (warehouseIds === undefined || warehouseIds === null) {
      const cachedStats = await this.cacheManager.get<StatsResponseDto>(this.CACHE_KEYS.STATS);
      if (cachedStats) {
        return cachedStats;
      }
    }

    const wFilter = warehouseFilter(warehouseIds);
    const wIdFilter = warehouseFilter(warehouseIds, 'id');

    // Optimized query: fetch all warehouses with their item counts in one query
    const [
      total,
      inStock,
      lowStock,
      outOfStock,
      inUse,
      totalValueResult,
      categoryStats,
      warehousesWithCounts,
    ] = await Promise.all([
      this.prisma.inventoryItem.count({ where: { deletedAt: null, ...wFilter } }),
      this.prisma.inventoryItem.count({ where: { status: InventoryStatus.IN_STOCK, deletedAt: null, ...wFilter } }),
      this.prisma.inventoryItem.count({ where: { status: InventoryStatus.LOW_STOCK, deletedAt: null, ...wFilter } }),
      this.prisma.inventoryItem.count({ where: { status: InventoryStatus.OUT_OF_STOCK, deletedAt: null, ...wFilter } }),
      this.prisma.inventoryItem.count({ where: { status: InventoryStatus.IN_USE, deletedAt: null, ...wFilter } }),
      // Compute SUM(price * quantity) in the DB to avoid loading all rows into memory.
      // Prisma cannot express price * quantity natively, so a raw query is used here.
      // warehouseIds === undefined means the value was never passed (admin global view),
      // warehouseIds === null means unrestricted access (no warehouse filter applied).
      // Column names are camelCase (matching Prisma's default mapping); the
      // models don't use @map. Using snake_case here breaks on both SQLite
      // (column not found) and Postgres (unquoted identifiers fold to
      // lowercase and miss the actual `"deletedAt"`/`"warehouseId"` columns).
      warehouseIds != null && warehouseIds !== undefined && warehouseIds.length > 0
        ? this.prisma.$queryRaw<[{ total: number }]>`
            SELECT COALESCE(SUM(price * quantity), 0) AS total
            FROM inventory_items
            WHERE "deletedAt" IS NULL
              AND price IS NOT NULL
              AND "warehouseId" IN (${Prisma.join(warehouseIds)})
          `
        : this.prisma.$queryRaw<[{ total: number }]>`
            SELECT COALESCE(SUM(price * quantity), 0) AS total
            FROM inventory_items
            WHERE "deletedAt" IS NULL
              AND price IS NOT NULL
          `,
      this.prisma.inventoryItem.groupBy({
        by: ['category'],
        where: { deletedAt: null, ...wFilter },
        _count: { category: true },
      }),
      // Optimized: Fetch warehouses with item count using include
      this.prisma.warehouse.findMany({
        where: wIdFilter,
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

    const totalValue = parseFloat(String((totalValueResult as [{ total: unknown }])[0]?.total ?? 0));

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
      inUse,
      totalValue,
      categories: categoryStats.map(stat => ({
        name: stat.category,
        count: stat._count.category,
      })),
      locations: locationStats,
    };

    // Cache the stats for 60 seconds (only for unrestricted/global access)
    if (warehouseIds == null) {
      await this.cacheManager.set(this.CACHE_KEYS.STATS, stats, 60000);
    }

    return stats;
  }

  async getLowStockItems(warehouseIds?: string[] | null): Promise<InventoryItem[]> {
    return this.prisma.inventoryItem.findMany({
      where: {
        ...warehouseFilter(warehouseIds),
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

  async getCategories(warehouseIds?: string[] | null): Promise<string[]> {
    // Scope cache key to warehouse context so users only see their warehouses' categories
    const cacheKey = warehouseIds?.length
      ? `${this.CACHE_KEYS.CATEGORIES}:${[...warehouseIds].sort().join(',')}`
      : this.CACHE_KEYS.CATEGORIES;

    const cached = await this.cacheManager.get<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const categories = await this.prisma.inventoryItem.findMany({
      distinct: ['category'],
      where: { deletedAt: null, ...warehouseFilter(warehouseIds) },
      select: { category: true },
      orderBy: { category: 'asc' },
    });
    const result = categories.map(c => c.category).filter((c): c is string => c !== null);

    // Cache for 5 minutes
    await this.cacheManager.set(cacheKey, result, 300000);

    return result;
  }

  async getLocations(warehouseIds?: string[] | null): Promise<string[]> {
    // Scope cache key to warehouse context
    const cacheKey = warehouseIds?.length
      ? `${this.CACHE_KEYS.LOCATIONS}:${[...warehouseIds].sort().join(',')}`
      : this.CACHE_KEYS.LOCATIONS;

    const cached = await this.cacheManager.get<string[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const where = warehouseIds?.length ? { id: { in: warehouseIds }, deletedAt: null } : {};
    const warehouses = await this.prisma.warehouse.findMany({
      where,
      orderBy: { name: 'asc' },
      select: { name: true },
    });
    const result = warehouses.map(w => w.name);

    // Cache for 5 minutes
    await this.cacheManager.set(cacheKey, result, 300000);

    return result;
  }

  // Cache invalidation method.
  // Uses reset() to clear all keys because getCategories and getLocations write
  // scoped keys per warehouse combination (e.g. inventory:categories:wh1,wh2)
  // that cannot be enumerated cheaply. reset() is safe here: the cache is
  // in-memory and short-lived (60s stats, 5m categories/locations).
  async invalidateCache(): Promise<void> {
    await this.cacheManager.reset();
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
            error: 'Item not found',
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
              error: 'Warehouse not found',
            });
            continue;
          }
        }

        // Auto-update status if quantity is being updated
        let status = item.status;
        if (item.quantity !== undefined && !status) {
          const minQty = item.minQuantity || existing.minQuantity;
          if (existing.itemType === ItemType.UNIQUE && existing.assignedToUserId) {
            status = InventoryStatus.IN_USE;
          } else if (item.quantity === 0) {
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
          changes: { after: { bulk: true }, fields: Object.keys(updateData) },
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
            error: 'Item not found',
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
          changes: { after: { bulk: true, reason: dto.reason } },
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
            error: 'Warehouse not found',
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
          changes: { after: { bulk: true, name: item.name } },
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

  async resetAll(userId?: string): Promise<{ deletedCount: number }> {
    const count = await this.prisma.inventoryItem.count({ where: { deletedAt: null } });

    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryItem.updateMany({
        where: { deletedAt: null },
        data: { deletedAt: new Date() },
      });
    });

    // Log audit
    await this.auditService.log({
      action: 'DELETE',
      entity: 'InventoryItem',
      entityId: 'ALL',
      userId,
      changes: { after: { resetAll: true, deletedCount: count } },
    });

    // Invalidate cache
    await this.invalidateCache();

    // Emit WebSocket event
    this.eventsService.emitInventoryChange('reset', undefined, { count });

    return { deletedCount: count };
  }

  async generateImportTemplate(): Promise<Buffer> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Importar Inventario');

    // Load reference data from DB
    const warehouses = await this.prisma.warehouse.findMany({ select: { name: true } });
    const suppliers = await this.prisma.supplier.findMany({ select: { name: true } });
    const categoryRows = await this.prisma.inventoryItem.findMany({
      where: { deletedAt: null },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });

    const warehouseNames = warehouses.map(w => w.name).filter(Boolean);
    const supplierNames = suppliers.map(s => s.name).filter(Boolean);
    const categoryNames = categoryRows.map(r => r.category).filter(Boolean);

    // Define 14 columns (A-N)
    worksheet.columns = [
      { header: 'Nombre*', key: 'name', width: 28 },
      { header: 'Descripción', key: 'description', width: 32 },
      { header: 'Cantidad*', key: 'quantity', width: 12 },
      { header: 'Mínimo', key: 'minQuantity', width: 12 },
      { header: 'Categoría*', key: 'category', width: 22 },
      { header: 'Tipo', key: 'itemType', width: 12 },
      { header: 'SKU', key: 'sku', width: 16 },
      { header: 'Código de Barras', key: 'barcode', width: 20 },
      { header: 'Precio', key: 'price', width: 12 },
      { header: 'Moneda', key: 'currency', width: 10 },
      { header: 'Almacén*', key: 'warehouseName', width: 22 },
      { header: 'Proveedor', key: 'supplierName', width: 22 },
      { header: 'Service Tag', key: 'serviceTag', width: 16 },
      { header: 'N° Serie', key: 'serialNumber', width: 16 },
    ];

    // Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E3D' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = {
        bottom: { style: 'medium', color: { argb: 'FF4D7C6F' } },
      };
    });

    // Freeze header row
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Helper: build inline dropdown formula (Excel limit ~255 chars)
    const toFormula = (names: string[]): string | null => {
      if (names.length === 0) return null;
      const limited: string[] = [];
      let len = 0;
      for (const name of names) {
        const part = (limited.length > 0 ? ',' : '') + name;
        if (len + part.length > 250) break;
        limited.push(name);
        len += part.length;
      }
      return limited.length > 0 ? `"${limited.join(',')}"` : null;
    };

    const DATA_ROWS = 500;

    // E: Categoría dropdown
    const categoryFormula = toFormula(categoryNames);
    if (categoryFormula) {
      worksheet.dataValidations.add(`E2:E${DATA_ROWS + 1}`, {
        type: 'list', allowBlank: true, formulae: [categoryFormula],
      });
    }

    // F: Tipo dropdown
    worksheet.dataValidations.add(`F2:F${DATA_ROWS + 1}`, {
      type: 'list', allowBlank: true, formulae: ['"BULK,UNIQUE"'],
    });

    // J: Moneda dropdown
    worksheet.dataValidations.add(`J2:J${DATA_ROWS + 1}`, {
      type: 'list', allowBlank: true, formulae: ['"USD,HNL"'],
    });

    // K: Almacén dropdown
    const warehouseFormula = toFormula(warehouseNames);
    if (warehouseFormula) {
      worksheet.dataValidations.add(`K2:K${DATA_ROWS + 1}`, {
        type: 'list', allowBlank: true, formulae: [warehouseFormula],
      });
    }

    // L: Proveedor dropdown
    const supplierFormula = toFormula(supplierNames);
    if (supplierFormula) {
      worksheet.dataValidations.add(`L2:L${DATA_ROWS + 1}`, {
        type: 'list', allowBlank: true, formulae: [supplierFormula],
      });
    }

    // Add 2 example rows
    const exampleWarehouse = warehouseNames[0] || 'Bodega Principal';
    const exampleCategory = categoryNames[0] || 'Electrónica';
    const exampleSupplier = supplierNames[0] || '';

    worksheet.addRow([
      'Laptop Dell Latitude 5430', 'Laptop empresarial 14"', 1, 1,
      exampleCategory, 'UNIQUE', 'LAP-DELL-001', '', 1200.00, 'USD',
      exampleWarehouse, exampleSupplier, 'ABC-TAG-001', 'SN-456789',
    ]);
    worksheet.addRow([
      'Papel A4 500 Hojas', 'Papel blanco para impresión', 100, 20,
      exampleCategory, 'BULK', 'PAP-A4-500', '1234567890', 5.99, 'USD',
      exampleWarehouse, '', '', '',
    ]);

    // Light style for example rows
    [2, 3].forEach(rowNum => {
      const row = worksheet.getRow(rowNum);
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9F7' } };
        cell.font = { color: { argb: 'FF555555' }, italic: true, name: 'Calibri' };
      });
    });

    return workbook.xlsx.writeBuffer() as Promise<Buffer>;
  }

  async parseExcelFile(buffer: Buffer): Promise<BulkImportDto['items']> {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException('Excel file has no worksheets');
    }

    // Pre-load warehouses and suppliers for name-based lookup
    const warehouses = await this.prisma.warehouse.findMany({ select: { id: true, name: true } });
    const suppliers = await this.prisma.supplier.findMany({ select: { id: true, name: true } });
    const warehouseMap = new Map(warehouses.map(w => [w.name.toLowerCase(), w.id]));
    const supplierMap = new Map(suppliers.map(s => [s.name.toLowerCase(), s.id]));

    const items: BulkImportDto['items'] = [];
    const headers: string[] = [];

    // Normalize header: strip *, remove diacritics, lowercase, trim
    const normalizeHeader = (raw: string): string =>
      raw.replace(/\*/g, '').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Get headers from first row
    worksheet.getRow(1).eachCell((cell, colNumber) => {
      headers[colNumber] = cell.value ? normalizeHeader(cell.value.toString()) : '';
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
          case 'minimo':
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
          case 'codigo de barras':
            item.barcode = value?.toString();
            break;
          case 'itemtype':
          case 'tipo':
            item.itemType = value?.toString().toUpperCase() === 'UNIQUE' ? 'UNIQUE' : 'BULK';
            break;
          case 'servicetag':
          case 'service_tag':
          case 'service tag':
            item.serviceTag = value?.toString();
            break;
          case 'serialnumber':
          case 'serial_number':
          case 'numeroserie':
          case 'n\u00b0 serie': // N° serie (degree symbol U+00B0)
          case 'n serie':
            item.serialNumber = value?.toString();
            break;
          case 'warehouseid':
          case 'warehouse_id':
          case 'almacen': {
            // Resolve by name first, fall back to raw value (UUID)
            const wName = value?.toString()?.toLowerCase();
            item.warehouseId = (wName && warehouseMap.get(wName)) || value?.toString();
            break;
          }
          case 'supplierid':
          case 'supplier_id':
          case 'proveedor': {
            const sName = value?.toString()?.toLowerCase();
            const sId = sName ? supplierMap.get(sName) : undefined;
            if (sId) item.supplierId = sId;
            break;
          }
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
