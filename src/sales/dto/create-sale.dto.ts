import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  IsEnum,
  IsBoolean,
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

  // Null/absent inherits the sale's effective taxPercent; an explicit value
  // (including 0) overrides it for this line only.
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  taxPercent?: number;
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

  // Suggested default is FiscalConfig.isvPercent but always editable per
  // document; absent/null means no tax unless a line overrides it.
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  taxPercent?: number;

  // true = create as a DRAFT quotation: no stock impact, no number assigned
  // until confirmed. Absent/false is today's exact behavior (ACTIVE at once).
  @IsBoolean()
  @IsOptional()
  asDraft?: boolean;
}
