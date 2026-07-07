import {
  IsString,
  IsArray,
  IsOptional,
  ValidateNested,
  IsNumber,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TransferRequestItemDto {
  @IsString()
  inventoryItemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;
}

export class CreateTransferRequestDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  sourceWarehouseId: string;

  @IsString()
  destinationWarehouseId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferRequestItemDto)
  @ArrayMinSize(1)
  items: TransferRequestItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;
}
