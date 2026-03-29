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
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { StockTakeService } from './stock-take.service';
import { CreateStockTakeDto, UpdateStockTakeItemDto } from './dto/create-stock-take.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { PaginationDto } from '../common/dto/pagination.dto';
import { StockTakeStatus } from '@prisma/client';

@ApiTags('stock-take')
@Controller('stock-take')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StockTakeController {
  constructor(private readonly stockTakeService: StockTakeService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('stocktake:create')
  create(
    @Body(ValidationPipe) dto: CreateStockTakeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockTakeService.create(dto, user.userId);
  }

  @Get()
  @Permissions('stocktake:view')
  @ApiQuery({ name: 'status', enum: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'], required: false })
  findAll(
    @Query(ValidationPipe) pagination: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.stockTakeService.findAll(pagination, status as StockTakeStatus);
  }

  @Get('stats')
  @Permissions('stocktake:view')
  getStats() {
    return this.stockTakeService.getStats();
  }

  @Get(':id')
  @Permissions('stocktake:view')
  findOne(@Param('id') id: string) {
    return this.stockTakeService.findOne(id);
  }

  @Get(':id/variance-report')
  @Permissions('stocktake:view')
  getVarianceReport(@Param('id') id: string) {
    return this.stockTakeService.getVarianceReport(id);
  }

  @Patch(':id/items')
  @Permissions('stocktake:create')
  updateItem(
    @Param('id') id: string,
    @Body(ValidationPipe) dto: UpdateStockTakeItemDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockTakeService.updateItem(id, dto, user.userId);
  }

  @Patch(':id/complete')
  @Permissions('stocktake:manage')
  complete(
    @Param('id') id: string,
    @Query('applyChanges') applyChanges: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const apply = applyChanges === 'true';
    return this.stockTakeService.complete(id, user.userId, apply);
  }

  @Patch(':id/cancel')
  @Permissions('stocktake:manage')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stockTakeService.cancel(id, user.userId);
  }
}
