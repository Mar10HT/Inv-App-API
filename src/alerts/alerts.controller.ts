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
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions } from '../auth/decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import { AlertType } from '@prisma/client';

@ApiTags('alerts')
@Controller('alerts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  @Permissions('alerts:view')
  findAll(@Query(ValidationPipe) pagination: PaginationDto) {
    return this.alertsService.findAll(pagination);
  }

  @Get('active')
  @Permissions('alerts:view')
  findActive(@Query(ValidationPipe) pagination: PaginationDto) {
    return this.alertsService.findActive(pagination);
  }

  @Get('stats')
  @Permissions('alerts:view')
  getStats() {
    return this.alertsService.getStats();
  }

  @Get('low-stock')
  @Permissions('alerts:view')
  findLowStock(@Query(ValidationPipe) pagination: PaginationDto) {
    return this.alertsService.findByType(AlertType.LOW_STOCK, pagination);
  }

  @Get('out-of-stock')
  @Permissions('alerts:view')
  findOutOfStock(@Query(ValidationPipe) pagination: PaginationDto) {
    return this.alertsService.findByType(AlertType.OUT_OF_STOCK, pagination);
  }

  @Get('expiring-soon')
  @Permissions('alerts:view')
  findExpiringSoon(@Query(ValidationPipe) pagination: PaginationDto) {
    return this.alertsService.findByType(AlertType.EXPIRING_SOON, pagination);
  }

  @Get(':id')
  @Permissions('alerts:view')
  findOne(@Param('id') id: string) {
    return this.alertsService.findOne(id);
  }

  @Patch(':id/notify')
  @Permissions('alerts:manage')
  markAsNotified(@Param('id') id: string) {
    return this.alertsService.markAsNotified(id);
  }

  @Patch(':id/resolve')
  @Permissions('alerts:manage')
  resolve(@Param('id') id: string) {
    return this.alertsService.resolve(id);
  }

  @Post('trigger-check')
  @Permissions('alerts:manage')
  triggerCheck() {
    return this.alertsService.triggerCheck();
  }
}
