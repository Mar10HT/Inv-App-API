import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  IsNumber,
  IsEnum,
  MinLength,
  MaxLength,
  IsDateString,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import { InventoryStatus, Currency, ItemType } from '@prisma/client';

@ValidatorConstraint({ name: 'UniqueItemQuantity', async: false })
export class UniqueItemQuantityConstraint
  implements ValidatorConstraintInterface
{
  validate(quantity: number, args: ValidationArguments) {
    const dto = args.object as CreateInventoryDto;
    // If UNIQUE item, quantity must be 0 or 1
    if (dto.itemType === ItemType.UNIQUE) {
      return quantity === 0 || quantity === 1;
    }
    // For BULK items, any positive number is fine
    return quantity >= 0;
  }

  defaultMessage(args: ValidationArguments) {
    const dto = args.object as CreateInventoryDto;
    if (dto.itemType === ItemType.UNIQUE) {
      return 'UNIQUE items can only have quantity 0 or 1';
    }
    return 'Quantity must be a positive number';
  }
}

export class CreateInventoryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  description?: string;

  @IsInt()
  @Min(0)
  @Validate(UniqueItemQuantityConstraint)
  quantity: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  minQuantity?: number;

  @IsString()
  @IsNotEmpty()
  category: string;

  @IsEnum(InventoryStatus)
  @IsOptional()
  status?: InventoryStatus;

  @IsNumber()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  sku?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  barcode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  imageUrl?: string;

  // Product model/brand
  @IsString()
  @IsOptional()
  @MaxLength(255)
  model?: string;

  // Item type (UNIQUE or BULK)
  @IsEnum(ItemType)
  @IsOptional()
  itemType?: ItemType;

  // For UNIQUE items - service tag
  @IsString()
  @IsOptional()
  @MaxLength(100)
  serviceTag?: string;

  // For UNIQUE items - serial number
  @IsString()
  @IsOptional()
  @MaxLength(100)
  serialNumber?: string;

  // Warehouse ID (required)
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  // Supplier ID (optional)
  @IsString()
  @IsOptional()
  supplierId?: string;

  // Assignment for UNIQUE items
  @IsString()
  @IsOptional()
  assignedToUserId?: string;

  @IsString()
  @IsOptional()
  createdById?: string;

  // Expiration date for perishable items
  @IsDateString()
  @IsOptional()
  expirationDate?: string;
}
