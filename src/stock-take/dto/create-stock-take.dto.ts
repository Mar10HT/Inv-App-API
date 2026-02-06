import { IsString, IsOptional } from 'class-validator';

export class CreateStockTakeDto {
  @IsString()
  warehouseId: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateStockTakeItemDto {
  @IsString()
  itemId: string;

  countedQty: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
