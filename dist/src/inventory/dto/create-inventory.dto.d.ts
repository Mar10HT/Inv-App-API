import { InventoryStatus, Currency } from '@prisma/client';
export declare class CreateInventoryDto {
    name: string;
    description?: string;
    quantity: number;
    minQuantity?: number;
    category: string;
    location: string;
    status?: InventoryStatus;
    price?: number;
    currency?: Currency;
    sku?: string;
    barcode?: string;
    imageUrl?: string;
    createdById?: string;
}
