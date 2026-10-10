import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
  MaxLength,
  IsArray,
  ArrayMinSize,
  ValidateNested,
  ValidateIf,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Currency, ItemType } from '@prisma/client';
import { PaymentCondition } from '@prisma/client';

export class PurchaseInvoiceItemDto {
  // Discriminator: which shape the rest of this line follows. Reuses the
  // Prisma ItemType enum rather than inventing a parallel string union.
  @IsEnum(ItemType)
  kind: ItemType;

  // BULK only: tops up an existing InventoryItem.
  @ValidateIf((o: PurchaseInvoiceItemDto) => o.kind === ItemType.BULK)
  @IsString()
  @IsNotEmpty()
  inventoryItemId?: string;

  @ValidateIf((o: PurchaseInvoiceItemDto) => o.kind === ItemType.BULK)
  @IsNumber()
  @Min(1)
  quantity?: number;

  // UNIQUE only: describes the brand-new InventoryItem this physical unit
  // becomes (one row = one unit, see schema comment on PurchaseInvoiceItem).
  @ValidateIf((o: PurchaseInvoiceItemDto) => o.kind === ItemType.UNIQUE)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  // Legacy field name, matches CreateInventoryDto.category exactly (that
  // DTO has no categoryId — only this required string).
  @ValidateIf((o: PurchaseInvoiceItemDto) => o.kind === ItemType.UNIQUE)
  @IsString()
  @IsNotEmpty()
  category?: string;

  @ValidateIf((o: PurchaseInvoiceItemDto) => o.kind === ItemType.UNIQUE)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  serviceTag?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  serialNumber?: string;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  // Null/absent inherits the invoice's taxPercent; an explicit value
  // (including 0) overrides it for this line only.
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercent?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreatePurchaseInvoiceDto {
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @IsString()
  @IsNotEmpty()
  supplierId: string;

  // The supplier's own invoice number — stays user-typed, has to match the
  // real physical document. The internal correlative (Sale-style COM-0001)
  // is never accepted from the client, only assigned by the service.
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  invoiceNumber: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taxPercent?: number;

  @IsOptional()
  @IsEnum(PaymentCondition)
  paymentCondition?: PaymentCondition;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PurchaseInvoiceItemDto)
  items: PurchaseInvoiceItemDto[];
}
