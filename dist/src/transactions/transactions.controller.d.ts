import { TransactionsService } from './transactions.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
export declare class TransactionsController {
    private readonly transactionsService;
    constructor(transactionsService: TransactionsService);
    create(createTransactionDto: CreateTransactionDto): Promise<{
        user: {
            id: string;
            email: string;
            name: string | null;
        };
        sourceWarehouse: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        destinationWarehouse: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        items: ({
            inventoryItem: {
                category: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                quantity: number;
                name: string;
                description: string | null;
                minQuantity: number;
                status: import("@prisma/client").$Enums.InventoryStatus;
                price: number | null;
                currency: import("@prisma/client").$Enums.Currency;
                sku: string | null;
                barcode: string | null;
                imageUrl: string | null;
                itemType: import("@prisma/client").$Enums.ItemType;
                serviceTag: string | null;
                serialNumber: string | null;
                warehouseId: string;
                supplierId: string | null;
                assignedToUserId: string | null;
                assignedAt: Date | null;
                createdById: string | null;
            };
        } & {
            id: string;
            notes: string | null;
            quantity: number;
            inventoryItemId: string;
            transactionId: string;
        })[];
    } & {
        id: string;
        type: string;
        date: Date;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
        sourceWarehouseId: string | null;
        destinationWarehouseId: string | null;
        userId: string;
    }>;
    findAll(): Promise<({
        user: {
            id: string;
            email: string;
            name: string | null;
        };
        sourceWarehouse: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        destinationWarehouse: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        items: ({
            inventoryItem: {
                category: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                quantity: number;
                name: string;
                description: string | null;
                minQuantity: number;
                status: import("@prisma/client").$Enums.InventoryStatus;
                price: number | null;
                currency: import("@prisma/client").$Enums.Currency;
                sku: string | null;
                barcode: string | null;
                imageUrl: string | null;
                itemType: import("@prisma/client").$Enums.ItemType;
                serviceTag: string | null;
                serialNumber: string | null;
                warehouseId: string;
                supplierId: string | null;
                assignedToUserId: string | null;
                assignedAt: Date | null;
                createdById: string | null;
            };
        } & {
            id: string;
            notes: string | null;
            quantity: number;
            inventoryItemId: string;
            transactionId: string;
        })[];
    } & {
        id: string;
        type: string;
        date: Date;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
        sourceWarehouseId: string | null;
        destinationWarehouseId: string | null;
        userId: string;
    })[]>;
    findRecent(limit?: string): Promise<({
        user: {
            id: string;
            email: string;
            name: string | null;
        };
        sourceWarehouse: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        destinationWarehouse: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        items: ({
            inventoryItem: {
                category: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                quantity: number;
                name: string;
                description: string | null;
                minQuantity: number;
                status: import("@prisma/client").$Enums.InventoryStatus;
                price: number | null;
                currency: import("@prisma/client").$Enums.Currency;
                sku: string | null;
                barcode: string | null;
                imageUrl: string | null;
                itemType: import("@prisma/client").$Enums.ItemType;
                serviceTag: string | null;
                serialNumber: string | null;
                warehouseId: string;
                supplierId: string | null;
                assignedToUserId: string | null;
                assignedAt: Date | null;
                createdById: string | null;
            };
        } & {
            id: string;
            notes: string | null;
            quantity: number;
            inventoryItemId: string;
            transactionId: string;
        })[];
    } & {
        id: string;
        type: string;
        date: Date;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
        sourceWarehouseId: string | null;
        destinationWarehouseId: string | null;
        userId: string;
    })[]>;
    findOne(id: string): Promise<{
        user: {
            id: string;
            email: string;
            name: string | null;
        };
        sourceWarehouse: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        destinationWarehouse: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        items: ({
            inventoryItem: {
                category: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                quantity: number;
                name: string;
                description: string | null;
                minQuantity: number;
                status: import("@prisma/client").$Enums.InventoryStatus;
                price: number | null;
                currency: import("@prisma/client").$Enums.Currency;
                sku: string | null;
                barcode: string | null;
                imageUrl: string | null;
                itemType: import("@prisma/client").$Enums.ItemType;
                serviceTag: string | null;
                serialNumber: string | null;
                warehouseId: string;
                supplierId: string | null;
                assignedToUserId: string | null;
                assignedAt: Date | null;
                createdById: string | null;
            };
        } & {
            id: string;
            notes: string | null;
            quantity: number;
            inventoryItemId: string;
            transactionId: string;
        })[];
    } & {
        id: string;
        type: string;
        date: Date;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
        sourceWarehouseId: string | null;
        destinationWarehouseId: string | null;
        userId: string;
    }>;
    update(id: string, updateTransactionDto: UpdateTransactionDto): Promise<{
        user: {
            id: string;
            email: string;
            name: string | null;
        };
        sourceWarehouse: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        destinationWarehouse: {
            id: string;
            createdAt: Date;
            updatedAt: Date;
            name: string;
            location: string;
            description: string | null;
            isActive: boolean;
        } | null;
        items: ({
            inventoryItem: {
                category: string;
                id: string;
                createdAt: Date;
                updatedAt: Date;
                quantity: number;
                name: string;
                description: string | null;
                minQuantity: number;
                status: import("@prisma/client").$Enums.InventoryStatus;
                price: number | null;
                currency: import("@prisma/client").$Enums.Currency;
                sku: string | null;
                barcode: string | null;
                imageUrl: string | null;
                itemType: import("@prisma/client").$Enums.ItemType;
                serviceTag: string | null;
                serialNumber: string | null;
                warehouseId: string;
                supplierId: string | null;
                assignedToUserId: string | null;
                assignedAt: Date | null;
                createdById: string | null;
            };
        } & {
            id: string;
            notes: string | null;
            quantity: number;
            inventoryItemId: string;
            transactionId: string;
        })[];
    } & {
        id: string;
        type: string;
        date: Date;
        notes: string | null;
        createdAt: Date;
        updatedAt: Date;
        sourceWarehouseId: string | null;
        destinationWarehouseId: string | null;
        userId: string;
    }>;
    remove(id: string): Promise<void>;
}
