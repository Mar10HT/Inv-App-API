import { IsString, IsNotEmpty, IsOptional, IsDateString, IsNumber, Min } from 'class-validator';
import { IsFutureDate } from '../../common/decorators';

export class CreateLoanDto {
  @IsString()
  @IsNotEmpty()
  inventoryItemId: string;

  @IsNumber()
  @Min(1)
  quantity: number;

  @IsString()
  @IsNotEmpty()
  sourceWarehouseId: string;

  @IsString()
  @IsNotEmpty()
  destinationWarehouseId: string;

  @IsDateString()
  @IsNotEmpty()
  @IsFutureDate({ message: 'Due date must be a date in the future' })
  dueDate: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
