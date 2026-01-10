"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const paginated_response_dto_1 = require("./dto/paginated-response.dto");
const client_1 = require("@prisma/client");
let InventoryService = class InventoryService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(createInventoryDto) {
        const warehouse = await this.prisma.warehouse.findUnique({
            where: { id: createInventoryDto.warehouseId },
        });
        if (!warehouse) {
            throw new common_1.NotFoundException(`Warehouse with ID ${createInventoryDto.warehouseId} not found`);
        }
        if (createInventoryDto.supplierId) {
            const supplier = await this.prisma.supplier.findUnique({
                where: { id: createInventoryDto.supplierId },
            });
            if (!supplier) {
                throw new common_1.NotFoundException(`Supplier with ID ${createInventoryDto.supplierId} not found`);
            }
        }
        if (createInventoryDto.assignedToUserId) {
            const user = await this.prisma.user.findUnique({
                where: { id: createInventoryDto.assignedToUserId },
            });
            if (!user) {
                throw new common_1.NotFoundException(`User with ID ${createInventoryDto.assignedToUserId} not found`);
            }
        }
        const itemType = createInventoryDto.itemType || client_1.ItemType.BULK;
        if (itemType === client_1.ItemType.UNIQUE) {
            if (createInventoryDto.quantity !== 1) {
                throw new common_1.BadRequestException('UNIQUE items must have quantity of 1');
            }
            if (!createInventoryDto.serviceTag && !createInventoryDto.serialNumber) {
                throw new common_1.BadRequestException('UNIQUE items must have either serviceTag or serialNumber');
            }
            if (createInventoryDto.assignedToUserId) {
                createInventoryDto['assignedAt'] = new Date();
            }
        }
        if (itemType === client_1.ItemType.BULK) {
            if (createInventoryDto.serviceTag || createInventoryDto.serialNumber) {
                throw new common_1.BadRequestException('BULK items cannot have serviceTag or serialNumber');
            }
            if (createInventoryDto.assignedToUserId) {
                throw new common_1.BadRequestException('BULK items cannot be assigned to users');
            }
        }
        if (createInventoryDto.sku) {
            const existing = await this.prisma.inventoryItem.findUnique({
                where: { sku: createInventoryDto.sku },
            });
            if (existing) {
                throw new common_1.ConflictException(`Item with SKU ${createInventoryDto.sku} already exists`);
            }
        }
        if (createInventoryDto.serviceTag) {
            const existing = await this.prisma.inventoryItem.findUnique({
                where: { serviceTag: createInventoryDto.serviceTag },
            });
            if (existing) {
                throw new common_1.ConflictException(`Item with service tag ${createInventoryDto.serviceTag} already exists`);
            }
        }
        let status = createInventoryDto.status;
        if (!status) {
            const minQty = createInventoryDto.minQuantity || 10;
            if (createInventoryDto.quantity === 0) {
                status = client_1.InventoryStatus.OUT_OF_STOCK;
            }
            else if (createInventoryDto.quantity <= minQty) {
                status = client_1.InventoryStatus.LOW_STOCK;
            }
            else {
                status = client_1.InventoryStatus.IN_STOCK;
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
    async findAll(filters) {
        const page = filters?.page || 1;
        const limit = filters?.limit || 10;
        const skip = (page - 1) * limit;
        const where = {};
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
        const orderBy = {};
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
        return new paginated_response_dto_1.PaginatedResponseDto(items, total, page, limit);
    }
    async findOne(id) {
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
            throw new common_1.NotFoundException(`Inventory item with ID ${id} not found`);
        }
        return item;
    }
    async update(id, updateInventoryDto) {
        await this.findOne(id);
        if (updateInventoryDto.sku) {
            const existing = await this.prisma.inventoryItem.findFirst({
                where: {
                    sku: updateInventoryDto.sku,
                    NOT: { id },
                },
            });
            if (existing) {
                throw new common_1.ConflictException(`Item with SKU ${updateInventoryDto.sku} already exists`);
            }
        }
        let status = updateInventoryDto.status;
        if (updateInventoryDto.quantity !== undefined && !status) {
            const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
            if (!item) {
                throw new common_1.NotFoundException(`Inventory item with ID ${id} not found`);
            }
            const minQty = updateInventoryDto.minQuantity || item.minQuantity;
            if (updateInventoryDto.quantity === 0) {
                status = client_1.InventoryStatus.OUT_OF_STOCK;
            }
            else if (updateInventoryDto.quantity <= minQty) {
                status = client_1.InventoryStatus.LOW_STOCK;
            }
            else {
                status = client_1.InventoryStatus.IN_STOCK;
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
    async remove(id) {
        await this.findOne(id);
        await this.prisma.inventoryItem.delete({
            where: { id },
        });
    }
    async getStats() {
        const [total, inStock, lowStock, outOfStock, items, categoryStats, warehouseStats,] = await Promise.all([
            this.prisma.inventoryItem.count(),
            this.prisma.inventoryItem.count({ where: { status: client_1.InventoryStatus.IN_STOCK } }),
            this.prisma.inventoryItem.count({ where: { status: client_1.InventoryStatus.LOW_STOCK } }),
            this.prisma.inventoryItem.count({ where: { status: client_1.InventoryStatus.OUT_OF_STOCK } }),
            this.prisma.inventoryItem.findMany({ select: { price: true, quantity: true } }),
            this.prisma.inventoryItem.groupBy({
                by: ['category'],
                _count: { category: true },
            }),
            this.prisma.inventoryItem.groupBy({
                by: ['warehouseId'],
                _count: { warehouseId: true },
            }),
        ]);
        const totalValue = items.reduce((sum, item) => {
            return sum + (item.price || 0) * item.quantity;
        }, 0);
        const warehouses = await this.prisma.warehouse.findMany();
        const locationStats = warehouseStats.map(stat => {
            const warehouse = warehouses.find(w => w.id === stat.warehouseId);
            return {
                name: warehouse?.name || 'Unknown',
                count: stat._count.warehouseId || 0,
            };
        });
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
            locations: locationStats,
        };
    }
    async getLowStockItems() {
        return this.prisma.inventoryItem.findMany({
            where: {
                OR: [
                    { status: client_1.InventoryStatus.LOW_STOCK },
                    { status: client_1.InventoryStatus.OUT_OF_STOCK },
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
    async getCategories() {
        const categories = await this.prisma.inventoryItem.findMany({
            distinct: ['category'],
            select: { category: true },
            orderBy: { category: 'asc' },
        });
        return categories.map(c => c.category);
    }
    async getLocations() {
        const warehouses = await this.prisma.warehouse.findMany({
            orderBy: { name: 'asc' },
            select: { name: true },
        });
        return warehouses.map(w => w.name);
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map