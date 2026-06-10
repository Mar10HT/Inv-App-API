import { IsOptional, IsString } from 'class-validator';

export class CancelSaleDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
