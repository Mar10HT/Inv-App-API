import { IsString, IsNotEmpty, IsOptional, IsInt, Min, IsNumber, IsEnum, MinLength, MaxLength } from 'class-validator';
import { InventoryStatus, Currency, ItemType } from '@prisma/client';

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
}
