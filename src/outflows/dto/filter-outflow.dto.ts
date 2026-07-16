import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OutflowReason, OutflowStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto';

export class FilterOutflowDto extends PaginationDto {
  @IsOptional()
  @IsEnum(OutflowStatus)
  status?: OutflowStatus;

  @IsOptional()
  @IsEnum(OutflowReason)
  reason?: OutflowReason;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}
