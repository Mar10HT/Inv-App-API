import {
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AlertType } from '@prisma/client';

@ApiTags('alerts')
@Controller('alerts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  findAll(@Query(ValidationPipe) pagination: PaginationDto) {
    return this.alertsService.findAll(pagination);
  }

  @Get('active')
  findActive(@Query(ValidationPipe) pagination: PaginationDto) {
    return this.alertsService.findActive(pagination);
  }

  @Get('stats')
  getStats() {
    return this.alertsService.getStats();
  }

  @Get('low-stock')
  findLowStock(@Query(ValidationPipe) pagination: PaginationDto) {
    return this.alertsService.findByType(AlertType.LOW_STOCK, pagination);
  }

  @Get('out-of-stock')
  findOutOfStock(@Query(ValidationPipe) pagination: PaginationDto) {
    return this.alertsService.findByType(AlertType.OUT_OF_STOCK, pagination);
  }

  @Get('expiring-soon')
  findExpiringSoon(@Query(ValidationPipe) pagination: PaginationDto) {
    return this.alertsService.findByType(AlertType.EXPIRING_SOON, pagination);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.alertsService.findOne(id);
  }

  @Patch(':id/notify')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  markAsNotified(@Param('id') id: string) {
    return this.alertsService.markAsNotified(id);
  }

  @Patch(':id/resolve')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  resolve(@Param('id') id: string) {
    return this.alertsService.resolve(id);
  }

  @Post('trigger-check')
  @Roles('SYSTEM_ADMIN')
  triggerCheck() {
    return this.alertsService.triggerCheck();
  }
}
