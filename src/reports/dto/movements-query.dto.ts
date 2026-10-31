import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from '../../common/dto';

export class MovementsQueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  warehouseId?: string;

  /** First day included ("2026-10-01"); a bare date is a day in Honduras. */
  @IsOptional()
  @IsDateString()
  from?: string;

  /** Last day included. */
  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsIn(['IN', 'OUT', 'TRANSFER'])
  type?: 'IN' | 'OUT' | 'TRANSFER';
}
