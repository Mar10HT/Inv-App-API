import { IsOptional, IsString } from 'class-validator';

export class CancelPaymentDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
