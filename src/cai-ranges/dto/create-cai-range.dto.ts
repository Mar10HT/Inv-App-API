import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  IsDateString,
  IsBoolean,
  Matches,
} from 'class-validator';

export class CreateCaiRangeDto {
  @IsString()
  @IsNotEmpty()
  cai: string;

  @Matches(/^\d{3}$/, { message: 'establishmentCode must be exactly 3 digits' })
  establishmentCode: string;

  @Matches(/^\d{3}$/, { message: 'emissionPointCode must be exactly 3 digits' })
  emissionPointCode: string;

  @IsOptional()
  @Matches(/^\d{2}$/, { message: 'documentTypeCode must be exactly 2 digits' })
  documentTypeCode?: string;

  @IsInt()
  @Min(1)
  rangeStart: number;

  @IsInt()
  @Min(1)
  rangeEnd: number;

  @IsDateString()
  expiresAt: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
