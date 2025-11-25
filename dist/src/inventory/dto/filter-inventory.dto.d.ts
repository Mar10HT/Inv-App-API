import { InventoryStatus } from '@prisma/client';
export declare class FilterInventoryDto {
    search?: string;
    category?: string;
    location?: string;
    status?: InventoryStatus;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}
