import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
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

  // Accounts Receivable view: only ACTIVE sales with balance > 0. A plain
  // @Type(() => Boolean) would be wrong here (Boolean('false') === true),
  // so this needs an explicit string-aware transform.
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  onlyWithBalance?: boolean;
}
