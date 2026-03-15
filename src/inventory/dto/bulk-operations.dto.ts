import { IsArray, IsString, IsOptional, IsNumber, ValidateNested, IsEnum, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryStatus, Currency, ItemType } from '@prisma/client';

// DTO for bulk update
export class BulkUpdateItemDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @IsNumber()
  minQuantity?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsEnum(InventoryStatus)
  status?: InventoryStatus;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;
}

export class BulkUpdateDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500, { message: 'Cannot update more than 500 items at once' })
  items: BulkUpdateItemDto[];
}

// DTO for bulk delete
export class BulkDeleteDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500, { message: 'Cannot delete more than 500 items at once' })
  ids: string[];

  @IsOptional()
  @IsString()
  reason?: string;
}

// DTO for bulk import from Excel/CSV
export class BulkImportItemDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsNumber()
  minQuantity?: number;

  @IsString()
  category: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsEnum(ItemType)
  itemType?: ItemType;

  @IsOptional()
  @IsString()
  serviceTag?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsString()
  warehouseId: string;

  @IsOptional()
  @IsString()
  supplierId?: string;
}

export class BulkImportDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkImportItemDto)
  @ArrayMinSize(1)
  @ArrayMaxSize(500, { message: 'Cannot import more than 500 items at once' })
  items: BulkImportItemDto[];

  @IsOptional()
  @IsString()
  createdById?: string;
}

// Response DTOs
export class BulkOperationResultDto {
  success: number;
  failed: number;
  errors: BulkOperationErrorDto[];
  createdIds?: string[];
  updatedIds?: string[];
  deletedIds?: string[];
}

export class BulkOperationErrorDto {
  index?: number;
  id?: string;
  error: string;
}
