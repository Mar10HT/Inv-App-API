import { InventoryStatus, Currency, ItemType } from '@prisma/client';
export declare class CreateInventoryDto {
    name: string;
    description?: string;
    quantity: number;
    minQuantity?: number;
    category: string;
    status?: InventoryStatus;
    price?: number;
    currency?: Currency;
    sku?: string;
    barcode?: string;
    imageUrl?: string;
    itemType?: ItemType;
    serviceTag?: string;
    serialNumber?: string;
    warehouseId: string;
    supplierId?: string;
    assignedToUserId?: string;
    createdById?: string;
}
