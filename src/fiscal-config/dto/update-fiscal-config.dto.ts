import {
  IsOptional,
  IsString,
  IsEmail,
  IsEnum,
  IsNumber,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Currency } from '@prisma/client';

export class UpdateFiscalConfigDto {
  @IsOptional()
  @Matches(/^\d{14}$/, { message: 'rtn must be exactly 14 digits' })
  rtn?: string;

  @IsOptional()
  @IsEmail()
  fiscalEmail?: string;

  @IsOptional()
  @IsString()
  fiscalPhone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  isvPercent?: number;
}
