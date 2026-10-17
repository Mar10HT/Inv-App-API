import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { PurchaseInvoiceStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto';

export class FilterPurchaseInvoiceDto extends PaginationDto {
  @IsOptional()
  @IsEnum(PurchaseInvoiceStatus)
  status?: PurchaseInvoiceStatus;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  // Accounts Payable view: only ACTIVE invoices with balance > 0.
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyWithBalance?: boolean;
}
