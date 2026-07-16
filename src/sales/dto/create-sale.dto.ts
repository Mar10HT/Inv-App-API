import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CustomerType, Currency } from '@prisma/client';

export class SaleItemDto {
  @IsString()
  @IsNotEmpty()
  inventoryItemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  // Price is entered manually per line at sale time (no per-product tiers).
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CreateSaleDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsString()
  @IsOptional()
  customerName?: string;

  @IsEnum(CustomerType)
  customerType: CustomerType;

  // Single currency for the whole sale; stored as a plain string snapshot.
  // Validated against the same USD/HNL values the inventory uses.
  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}
