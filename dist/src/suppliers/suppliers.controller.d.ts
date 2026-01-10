import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
export declare class SuppliersController {
    private readonly suppliersService;
    constructor(suppliersService: SuppliersService);
    create(createSupplierDto: CreateSupplierDto): Promise<{
        id: string;
        email: string | null;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        phone: string | null;
    }>;
    findAll(): Promise<({
        _count: {
            inventoryItems: number;
        };
    } & {
        id: string;
        email: string | null;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        phone: string | null;
    })[]>;
    findOne(id: string): Promise<{
        inventoryItems: {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
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
        email: string | null;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        phone: string | null;
    }>;
    update(id: string, updateSupplierDto: UpdateSupplierDto): Promise<{
        id: string;
        email: string | null;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        location: string;
        phone: string | null;
    }>;
    remove(id: string): Promise<void>;
}
