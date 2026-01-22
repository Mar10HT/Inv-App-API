import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Query,
  UseGuards,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { StockTakeService } from './stock-take.service';
import { CreateStockTakeDto, UpdateStockTakeItemDto } from './dto/create-stock-take.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import { StockTakeStatus } from '@prisma/client';

@Controller('stock-take')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StockTakeController {
  constructor(private readonly stockTakeService: StockTakeService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  create(
    @Body(ValidationPipe) dto: CreateStockTakeDto,
    @CurrentUser() user: any,
  ) {
    return this.stockTakeService.create(dto, user.id);
  }

  @Get()
  findAll(
    @Query(ValidationPipe) pagination: PaginationDto,
    @Query('status') status?: StockTakeStatus,
  ) {
    return this.stockTakeService.findAll(pagination, status);
  }

  @Get('stats')
  getStats() {
    return this.stockTakeService.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.stockTakeService.findOne(id);
  }

  @Get(':id/variance-report')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  getVarianceReport(@Param('id') id: string) {
    return this.stockTakeService.getVarianceReport(id);
  }

  @Patch(':id/items')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  updateItem(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateStockTakeItemDto,
    @CurrentUser() user: any,
  ) {
    return this.stockTakeService.updateItem(id, dto, user.id);
  }

  @Patch(':id/complete')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  complete(
    @Param('id') id: string,
    @Query('applyChanges') applyChanges: string,
    @CurrentUser() user: any,
  ) {
    const apply = applyChanges === 'true';
    return this.stockTakeService.complete(id, user.id, apply);
  }

  @Patch(':id/cancel')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.stockTakeService.cancel(id, user.id);
  }
}
