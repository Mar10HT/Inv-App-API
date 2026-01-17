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
exports.LoansService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let LoansService = class LoansService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    loanInclude = {
        inventoryItem: {
            select: {
                id: true,
                name: true,
                serviceTag: true,
                quantity: true,
            },
        },
        sourceWarehouse: {
            select: {
                id: true,
                name: true,
                location: true,
            },
        },
        destinationWarehouse: {
            select: {
                id: true,
                name: true,
                location: true,
            },
        },
        createdBy: {
            select: {
                id: true,
                email: true,
                name: true,
            },
        },
    };
    async create(createLoanDto) {
        if (createLoanDto.sourceWarehouseId === createLoanDto.destinationWarehouseId) {
            throw new common_1.BadRequestException('Source and destination warehouses must be different');
        }
        const item = await this.prisma.inventoryItem.findUnique({
            where: { id: createLoanDto.inventoryItemId },
        });
        if (!item) {
            throw new common_1.NotFoundException(`Inventory item with ID ${createLoanDto.inventoryItemId} not found`);
        }
        if (item.warehouseId !== createLoanDto.sourceWarehouseId) {
            throw new common_1.BadRequestException('Item does not belong to the source warehouse');
        }
        const existingLoan = await this.prisma.loan.findFirst({
            where: {
                inventoryItemId: createLoanDto.inventoryItemId,
                status: { in: ['ACTIVE', 'OVERDUE'] },
            },
        });
        if (existingLoan) {
            throw new common_1.BadRequestException('Item is already on loan');
        }
        const sourceWarehouse = await this.prisma.warehouse.findUnique({
            where: { id: createLoanDto.sourceWarehouseId },
        });
        const destinationWarehouse = await this.prisma.warehouse.findUnique({
            where: { id: createLoanDto.destinationWarehouseId },
        });
        if (!sourceWarehouse || !destinationWarehouse) {
            throw new common_1.NotFoundException('Invalid warehouse');
        }
        return this.prisma.loan.create({
            data: {
                inventoryItemId: createLoanDto.inventoryItemId,
                quantity: createLoanDto.quantity,
                sourceWarehouseId: createLoanDto.sourceWarehouseId,
                destinationWarehouseId: createLoanDto.destinationWarehouseId,
                dueDate: new Date(createLoanDto.dueDate),
                createdById: createLoanDto.createdById,
                notes: createLoanDto.notes,
            },
            include: this.loanInclude,
        });
    }
    async findAll(pagination) {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 10;
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.prisma.loan.findMany({
                skip,
                take: limit,
                orderBy: { loanDate: pagination?.sortOrder || 'desc' },
                include: this.loanInclude,
            }),
            this.prisma.loan.count(),
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
    async findActive() {
        return this.prisma.loan.findMany({
            where: {
                status: { in: ['ACTIVE', 'OVERDUE'] },
            },
            orderBy: { loanDate: 'desc' },
            include: this.loanInclude,
        });
    }
    async findOne(id) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: this.loanInclude,
        });
        if (!loan) {
            throw new common_1.NotFoundException(`Loan with ID ${id} not found`);
        }
        return loan;
    }
    async findByItem(inventoryItemId) {
        return this.prisma.loan.findMany({
            where: { inventoryItemId },
            orderBy: { loanDate: 'desc' },
            include: this.loanInclude,
        });
    }
    async findByWarehouse(warehouseId) {
        return this.prisma.loan.findMany({
            where: {
                OR: [
                    { sourceWarehouseId: warehouseId },
                    { destinationWarehouseId: warehouseId },
                ],
            },
            orderBy: { loanDate: 'desc' },
            include: this.loanInclude,
        });
    }
    async update(id, updateLoanDto) {
        try {
            return await this.prisma.loan.update({
                where: { id },
                data: {
                    ...updateLoanDto,
                    returnDate: updateLoanDto.returnDate
                        ? new Date(updateLoanDto.returnDate)
                        : undefined,
                },
                include: this.loanInclude,
            });
        }
        catch (error) {
            if (error.code === 'P2025') {
                throw new common_1.NotFoundException(`Loan with ID ${id} not found`);
            }
            throw error;
        }
    }
    async returnLoan(id, returnLoanDto) {
        const loan = await this.findOne(id);
        if (loan.status === 'RETURNED') {
            throw new common_1.BadRequestException('Loan is already returned');
        }
        const returnDate = returnLoanDto?.returnDate
            ? new Date(returnLoanDto.returnDate)
            : new Date();
        let notes = loan.notes || '';
        if (returnLoanDto?.notes) {
            notes = notes ? `${notes}\n${returnLoanDto.notes}` : returnLoanDto.notes;
        }
        return this.prisma.loan.update({
            where: { id },
            data: {
                status: 'RETURNED',
                returnDate,
                notes: notes || undefined,
            },
            include: this.loanInclude,
        });
    }
    async remove(id) {
        try {
            await this.prisma.loan.delete({
                where: { id },
            });
        }
        catch (error) {
            if (error.code === 'P2025') {
                throw new common_1.NotFoundException(`Loan with ID ${id} not found`);
            }
            throw error;
        }
    }
    async getStats() {
        const now = new Date();
        const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const [totalActive, totalOverdue, totalReturned, dueSoon] = await Promise.all([
            this.prisma.loan.count({ where: { status: 'ACTIVE' } }),
            this.prisma.loan.count({ where: { status: 'OVERDUE' } }),
            this.prisma.loan.count({ where: { status: 'RETURNED' } }),
            this.prisma.loan.count({
                where: {
                    status: 'ACTIVE',
                    dueDate: {
                        lte: sevenDaysFromNow,
                        gt: now,
                    },
                },
            }),
        ]);
        return {
            totalActive,
            totalOverdue,
            totalReturned,
            dueSoon,
        };
    }
    async isItemOnLoan(inventoryItemId) {
        const activeLoan = await this.prisma.loan.findFirst({
            where: {
                inventoryItemId,
                status: { in: ['ACTIVE', 'OVERDUE'] },
            },
        });
        return !!activeLoan;
    }
    async checkOverdueLoans() {
        const now = new Date();
        await this.prisma.loan.updateMany({
            where: {
                status: 'ACTIVE',
                dueDate: { lt: now },
            },
            data: {
                status: 'OVERDUE',
            },
        });
    }
};
exports.LoansService = LoansService;
exports.LoansService = LoansService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], LoansService);
//# sourceMappingURL=loans.service.js.map