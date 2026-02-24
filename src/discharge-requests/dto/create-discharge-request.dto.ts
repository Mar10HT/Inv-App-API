import { IsString, IsArray, IsOptional, ValidateNested, IsNumber, Min, ArrayMinSize, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class DischargeRequestItemDto {
  @IsString()
  inventoryItemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CreateDischargeRequestDto {
  @IsString()
  requesterName: string;

  @IsOptional()
  @IsString()
  requesterPosition?: string;

  @IsOptional()
  @IsString()
  requesterPhone?: string;

  @IsOptional()
  @IsDateString()
  neededByDate?: string;

  @IsOptional()
  @IsString()
  justification?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DischargeRequestItemDto)
  @ArrayMinSize(1)
  items: DischargeRequestItemDto[];
}
