import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CustomerType, SaleStatus } from '@prisma/client';
import { PaginationDto } from '../../common/dto';

export class FilterSaleDto extends PaginationDto {
  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
  @IsString()
  warehouseId?: string;
}
