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
exports.TransactionsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const create_transaction_dto_1 = require("./dto/create-transaction.dto");
let TransactionsService = class TransactionsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(createTransactionDto) {
        const { items, ...transactionData } = createTransactionDto;
        this.validateTransactionType(createTransactionDto);
        await this.validateItems(items);
        return this.prisma.$transaction(async (tx) => {
            const newTransaction = await tx.transaction.create({
                data: {
                    ...transactionData,
                    items: {
                        create: items.map((item) => ({
                            inventoryItemId: item.inventoryItemId,
                            quantity: item.quantity,
                            notes: item.notes,
                        })),
                    },
                },
                include: {
                    items: {
                        include: {
                            inventoryItem: true,
                        },
                    },
                    sourceWarehouse: true,
                    destinationWarehouse: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            name: true,
                        },
                    },
                },
            });
            await this.updateInventoryQuantitiesInTx(tx, items, transactionData.type);
            return newTransaction;
        });
    }
    async findAll(pagination) {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 10;
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.prisma.transaction.findMany({
                skip,
                take: limit,
                orderBy: {
                    date: pagination?.sortOrder || 'desc',
                },
                include: {
                    items: {
                        include: {
                            inventoryItem: true,
                        },
                    },
                    sourceWarehouse: true,
                    destinationWarehouse: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            name: true,
                        },
                    },
                },
            }),
            this.prisma.transaction.count(),
        ]);
        const totalPages = Math.ceil(total / limit);
        return {
            data,
            meta: {
                total,
                page,
                limit,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
            },
        };
    }
    async findRecent(limit = 10) {
        return this.prisma.transaction.findMany({
            take: limit,
            orderBy: {
                date: 'desc',
            },
            include: {
                items: {
                    include: {
                        inventoryItem: true,
                    },
                },
                sourceWarehouse: true,
                destinationWarehouse: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                    },
                },
            },
        });
    }
    async findOne(id) {
        const transaction = await this.prisma.transaction.findUnique({
            where: { id },
            include: {
                items: {
                    include: {
                        inventoryItem: true,
                    },
                },
                sourceWarehouse: true,
                destinationWarehouse: true,
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                    },
                },
            },
        });
        if (!transaction) {
            throw new common_1.NotFoundException(`Transaction with ID ${id} not found`);
        }
        return transaction;
    }
    async update(id, updateTransactionDto) {
        try {
            return await this.prisma.transaction.update({
                where: { id },
                data: updateTransactionDto,
                include: {
                    items: {
                        include: {
                            inventoryItem: true,
                        },
                    },
                    sourceWarehouse: true,
                    destinationWarehouse: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            name: true,
                        },
                    },
                },
            });
        }
        catch (error) {
            if (error.code === 'P2025') {
                throw new common_1.NotFoundException(`Transaction with ID ${id} not found`);
            }
            throw error;
        }
    }
    async remove(id) {
        try {
            await this.prisma.transaction.delete({
                where: { id },
            });
        }
        catch (error) {
            if (error.code === 'P2025') {
                throw new common_1.NotFoundException(`Transaction with ID ${id} not found`);
            }
            throw error;
        }
    }
    validateTransactionType(dto) {
        const { type, sourceWarehouseId, destinationWarehouseId } = dto;
        if (type === 'IN' && !destinationWarehouseId) {
            throw new common_1.BadRequestException('IN transactions require destinationWarehouseId');
        }
        if (type === 'OUT' && !sourceWarehouseId) {
            throw new common_1.BadRequestException('OUT transactions require sourceWarehouseId');
        }
        if (type === 'TRANSFER' && (!sourceWarehouseId || !destinationWarehouseId)) {
            throw new common_1.BadRequestException('TRANSFER transactions require both sourceWarehouseId and destinationWarehouseId');
        }
    }
    async validateItems(items) {
        for (const item of items) {
            const exists = await this.prisma.inventoryItem.findUnique({
                where: { id: item.inventoryItemId },
            });
            if (!exists) {
                throw new common_1.NotFoundException(`Inventory item with ID ${item.inventoryItemId} not found`);
            }
        }
    }
    async updateInventoryQuantitiesInTx(tx, items, type) {
        for (const item of items) {
            const currentItem = await tx.inventoryItem.findUnique({
                where: { id: item.inventoryItemId },
            });
            if (!currentItem)
                continue;
            let newQuantity = currentItem.quantity;
            if (type === create_transaction_dto_1.TransactionType.IN) {
                newQuantity += item.quantity;
            }
            else if (type === create_transaction_dto_1.TransactionType.OUT) {
                newQuantity -= item.quantity;
            }
            let newStatus = 'IN_STOCK';
            if (newQuantity <= 0) {
                newStatus = 'OUT_OF_STOCK';
                newQuantity = Math.max(0, newQuantity);
            }
            else if (newQuantity <= currentItem.minQuantity) {
                newStatus = 'LOW_STOCK';
            }
            await tx.inventoryItem.update({
                where: { id: item.inventoryItemId },
                data: {
                    quantity: newQuantity,
                    status: newStatus,
                },
            });
        }
    }
};
exports.TransactionsService = TransactionsService;
exports.TransactionsService = TransactionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TransactionsService);
//# sourceMappingURL=transactions.service.js.map