import { InventoryStatus, ItemType, Currency } from '@prisma/client';
export declare class FilterInventoryDto {
    search?: string;
    category?: string;
    status?: InventoryStatus;
    itemType?: ItemType;
    currency?: Currency;
    warehouseId?: string;
    supplierId?: string;
    assignedToUserId?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
