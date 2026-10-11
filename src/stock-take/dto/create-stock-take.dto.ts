import { IsString, IsOptional, IsNumber, Min } from 'class-validator';

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

  @IsNumber()
  @Min(0)
  countedQty: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
