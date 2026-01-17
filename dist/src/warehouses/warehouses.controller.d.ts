import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
export declare class WarehousesController {
    private readonly warehousesService;
    constructor(warehousesService: WarehousesService);
    create(createWarehouseDto: CreateWarehouseDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        description: string | null;
        isActive: boolean;
    }>;
    findAll(): Promise<({
        _count: {
            inventoryItems: number;
        };
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        description: string | null;
        isActive: boolean;
    })[]>;
    findOne(id: string): Promise<{
        inventoryItems: {
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
        }[];
        _count: {
            inventoryItems: number;
        };
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        description: string | null;
        isActive: boolean;
    }>;
    update(id: string, updateWarehouseDto: UpdateWarehouseDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        description: string | null;
        isActive: boolean;
    }>;
    remove(id: string): Promise<void>;
}
