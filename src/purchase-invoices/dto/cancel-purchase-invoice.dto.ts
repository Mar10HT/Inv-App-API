import { IsOptional, IsString } from 'class-validator';

export class CancelPurchaseInvoiceDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
