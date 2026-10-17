import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  Min,
  Matches,
} from 'class-validator';
import { Currency, PaymentCondition } from '@prisma/client';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @Matches(/^\d{14}$/, { message: 'rtn must be exactly 14 digits' })
  rtn?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(PaymentCondition)
  paymentCondition?: PaymentCondition;

  @IsOptional()
  @IsNumber()
  @Min(0)
  creditLimit?: number;

  // Currency of creditLimit; only CREDIT sales in it count toward the limit
  @IsOptional()
  @IsEnum(Currency)
  creditLimitCurrency?: Currency;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
