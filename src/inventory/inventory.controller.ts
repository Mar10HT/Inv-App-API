import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { FilterInventoryDto } from './dto/filter-inventory.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';

@Controller('inventory')
@UseGuards(JwtAuthGuard, RolesGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  create(@Body(ValidationPipe) createInventoryDto: CreateInventoryDto) {
    return this.inventoryService.create(createInventoryDto);
  }

  @Get()
  findAll(@Query(ValidationPipe) filters: FilterInventoryDto) {
    return this.inventoryService.findAll(filters);
  }

  @Get('stats')
  getStats() {
    return this.inventoryService.getStats();
  }

  @Get('low-stock')
  getLowStockItems() {
    return this.inventoryService.getLowStockItems();
  }

  @Get('categories')
  getCategories() {
    return this.inventoryService.getCategories();
  }

  @Get('locations')
  getLocations() {
    return this.inventoryService.getLocations();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateInventoryDto: UpdateInventoryDto,
  ) {
    return this.inventoryService.update(id, updateInventoryDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  async remove(@Param('id') id: string) {
    await this.inventoryService.remove(id);
  }
}
