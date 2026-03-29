import { IsArray, IsString, ArrayMaxSize } from 'class-validator';

export class AssignWarehousesDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(500)
  warehouseIds: string[];
}
