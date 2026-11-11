import { IsIn, IsOptional } from 'class-validator';
import { FilterInventoryDto } from '../../inventory/dto/filter-inventory.dto';

/**
 * The query of GET /reports/inventory/excel: the inventory filters plus the
 * language of the file. The app always sends `locale`; validated as part of
 * FilterInventoryDto alone it was a property the DTO doesn't know, so the
 * global pipe (forbidNonWhitelisted) answered 400 and the download failed.
 */
export class InventoryExcelQueryDto extends FilterInventoryDto {
  @IsIn(['en', 'es'])
  @IsOptional()
  locale?: 'en' | 'es';
}
