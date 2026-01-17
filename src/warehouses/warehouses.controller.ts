import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  create(@Body(ValidationPipe) createWarehouseDto: CreateWarehouseDto) {
    return this.warehousesService.create(createWarehouseDto);
  }

  @Get()
  findAll() {
    return this.warehousesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.warehousesService.findOne(id);
  }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateWarehouseDto: UpdateWarehouseDto,
  ) {
    return this.warehousesService.update(id, updateWarehouseDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  async remove(@Param('id') id: string) {
    await this.warehousesService.remove(id);
  }
}
