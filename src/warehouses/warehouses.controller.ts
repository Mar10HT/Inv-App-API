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
  ForbiddenException,
} from '@nestjs/common';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { PaginationDto } from '../common/dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { WarehouseAccessService } from '../common/warehouse-access/warehouse-access.service';

@Controller('warehouses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WarehousesController {
  constructor(
    private readonly warehousesService: WarehousesService,
    private readonly warehouseAccessService: WarehouseAccessService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('warehouse:create')
  create(@Body(ValidationPipe) createWarehouseDto: CreateWarehouseDto) {
    return this.warehousesService.create(createWarehouseDto);
  }

  @Get()
  @Permissions('warehouse:view')
  findAll(
    @Query(new ValidationPipe({ transform: true })) pagination: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.warehousesService.findAll(pagination, user.warehouseIds);
  }

  @Get(':id')
  @Permissions('warehouse:view')
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Validate access to this warehouse
    if (user.warehouseIds !== null && !user.warehouseIds.includes(id)) {
      throw new ForbiddenException('You do not have access to this warehouse');
    }
    return this.warehousesService.findOne(id);
  }

  @Patch(':id')
  @Permissions('warehouse:edit')
  async update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateWarehouseDto: UpdateWarehouseDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    if (user.warehouseIds !== null && !user.warehouseIds.includes(id)) {
      throw new ForbiddenException('You do not have access to this warehouse');
    }
    return this.warehousesService.update(id, updateWarehouseDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('warehouse:delete')
  async remove(@Param('id') id: string) {
    await this.warehousesService.remove(id);
  }

  @Patch(':id/manager')
  @Permissions('warehouse:delete')
  async setManager(
    @Param('id') id: string,
    @Body('managerId') managerId: string | null,
  ) {
    await this.warehouseAccessService.setWarehouseManager(id, managerId);
    return this.warehousesService.findOne(id);
  }
}
