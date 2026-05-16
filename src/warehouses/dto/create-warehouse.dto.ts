import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  ValidateIf,
} from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  // Optional. Empty string is normalized to null so the form can clear it.
  @ValidateIf((_, value) => value !== null && value !== '')
  @IsString()
  @IsOptional()
  managerId?: string | null;
}
