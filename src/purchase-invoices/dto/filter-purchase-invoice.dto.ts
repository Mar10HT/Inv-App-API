import { IsEnum, IsOptional, IsString } from 'class-validator';
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
}
