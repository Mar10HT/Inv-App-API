import { PrismaService } from '../prisma/prisma.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { PaginationDto, PaginatedResult } from '../common/dto';
export declare class TransactionsService {
    private prisma;
    constructor(prisma: PrismaService);
    create(createTransactionDto: CreateTransactionDto): Promise<{
        user: {
            id: string;
            email: string;
            name: string | null;
        };
        items: ({
            inventoryItem: {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                deletedAt: Date | null;
                description: string | null;
                quantity: number;
                minQuantity: number;
                category: string;
                status: import("@prisma/client").$Enums.InventoryStatus;
                price: number | null;
                currency: import("@prisma/client").$Enums.Currency;
                sku: string | null;
                barcode: string | null;
                imageUrl: string | null;
                itemType: import("@prisma/client").$Enums.ItemType;
                serviceTag: string | null;
                serialNumber: string | null;
                assignedAt: Date | null;
                warehouseId: string;
                supplierId: string | null;
                assignedToUserId: string | null;
                createdById: string | null;
            };
        } & {
            id: string;
            quantity: number;
            notes: string | null;
            inventoryItemId: string;
            transactionId: string;
        })[];
        sourceWarehouse: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        destinationWarehouse: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        sourceWarehouseId: string | null;
        destinationWarehouseId: string | null;
        userId: string;
        date: Date;
        notes: string | null;
    }>;
    findAll(pagination?: PaginationDto): Promise<PaginatedResult<any>>;
    findRecent(limit?: number): Promise<({
        user: {
            id: string;
            email: string;
            name: string | null;
        };
        items: ({
            inventoryItem: {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                deletedAt: Date | null;
                description: string | null;
                quantity: number;
                minQuantity: number;
                category: string;
                status: import("@prisma/client").$Enums.InventoryStatus;
                price: number | null;
                currency: import("@prisma/client").$Enums.Currency;
                sku: string | null;
                barcode: string | null;
                imageUrl: string | null;
                itemType: import("@prisma/client").$Enums.ItemType;
                serviceTag: string | null;
                serialNumber: string | null;
                assignedAt: Date | null;
                warehouseId: string;
                supplierId: string | null;
                assignedToUserId: string | null;
                createdById: string | null;
            };
        } & {
            id: string;
            quantity: number;
            notes: string | null;
            inventoryItemId: string;
            transactionId: string;
        })[];
        sourceWarehouse: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        destinationWarehouse: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        sourceWarehouseId: string | null;
        destinationWarehouseId: string | null;
        userId: string;
        date: Date;
        notes: string | null;
    })[]>;
    findOne(id: string): Promise<{
        user: {
            id: string;
            email: string;
            name: string | null;
        };
        items: ({
            inventoryItem: {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                deletedAt: Date | null;
                description: string | null;
                quantity: number;
                minQuantity: number;
                category: string;
                status: import("@prisma/client").$Enums.InventoryStatus;
                price: number | null;
                currency: import("@prisma/client").$Enums.Currency;
                sku: string | null;
                barcode: string | null;
                imageUrl: string | null;
                itemType: import("@prisma/client").$Enums.ItemType;
                serviceTag: string | null;
                serialNumber: string | null;
                assignedAt: Date | null;
                warehouseId: string;
                supplierId: string | null;
                assignedToUserId: string | null;
                createdById: string | null;
            };
        } & {
            id: string;
            quantity: number;
            notes: string | null;
            inventoryItemId: string;
            transactionId: string;
        })[];
        sourceWarehouse: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        destinationWarehouse: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        sourceWarehouseId: string | null;
        destinationWarehouseId: string | null;
        userId: string;
        date: Date;
        notes: string | null;
    }>;
    update(id: string, updateTransactionDto: UpdateTransactionDto): Promise<{
        user: {
            id: string;
            email: string;
            name: string | null;
        };
        items: ({
            inventoryItem: {
                id: string;
                name: string;
                createdAt: Date;
                updatedAt: Date;
                deletedAt: Date | null;
                description: string | null;
                quantity: number;
                minQuantity: number;
                category: string;
                status: import("@prisma/client").$Enums.InventoryStatus;
                price: number | null;
                currency: import("@prisma/client").$Enums.Currency;
                sku: string | null;
                barcode: string | null;
                imageUrl: string | null;
                itemType: import("@prisma/client").$Enums.ItemType;
                serviceTag: string | null;
                serialNumber: string | null;
                assignedAt: Date | null;
                warehouseId: string;
                supplierId: string | null;
                assignedToUserId: string | null;
                createdById: string | null;
            };
        } & {
            id: string;
            quantity: number;
            notes: string | null;
            inventoryItemId: string;
            transactionId: string;
        })[];
        sourceWarehouse: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        destinationWarehouse: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
    } & {
        id: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        sourceWarehouseId: string | null;
        destinationWarehouseId: string | null;
        userId: string;
        date: Date;
        notes: string | null;
    }>;
    remove(id: string): Promise<void>;
    private validateTransactionType;
    private validateItems;
    private updateInventoryQuantitiesInTx;
}
