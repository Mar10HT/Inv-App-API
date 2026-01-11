import { ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import { InventoryStatus, Currency, ItemType } from '@prisma/client';
export declare class UniqueItemQuantityConstraint implements ValidatorConstraintInterface {
    validate(quantity: number, args: ValidationArguments): boolean;
    defaultMessage(args: ValidationArguments): "UNIQUE items can only have quantity 0 or 1" | "Quantity must be a positive number";
}
export declare class CreateInventoryDto {
    name: string;
    description?: string;
    quantity: number;
    minQuantity?: number;
    category: string;
    model?: string;
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
