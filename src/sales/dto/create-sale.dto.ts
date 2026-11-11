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
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CustomerType, Currency, PaymentCondition } from '@prisma/client';

/**
 * One line of a sale or quotation: an inventory item (moves stock), a
 * catalog service, or a one-off line with just a name (itemName). The three
 * are told apart by which of inventoryItemId / serviceId is set; sending both
 * is refused in SalesService.
 */
export class SaleItemDto {
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  inventoryItemId?: string;

  @IsString()
  @IsNotEmpty()
  @IsOptional()
  serviceId?: string;

  /** Required for a one-off line; ignored otherwise (the name is snapshotted). */
  @IsString()
  @MaxLength(200)
  @IsOptional()
  itemName?: string;

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
  // Deprecated and ignored: documents are numbered automatically now. Still
  // accepted so a browser tab running the previous frontend doesn't get a 400.
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

  // Optional link to a real Client (Phase 2/5). Absent keeps today's
  // walk-in behavior — customerName above is unaffected either way.
  @IsString()
  @IsOptional()
  clientId?: string;

  // Suggested default is Client.paymentCondition (frontend-only prefill),
  // always editable; absent defaults to CASH same as PurchaseInvoice.
  @IsEnum(PaymentCondition)
  @IsOptional()
  paymentCondition?: PaymentCondition;

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
