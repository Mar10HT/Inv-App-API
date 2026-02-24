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
import { ApiTags } from '@nestjs/swagger';
import { DischargeRequestsService } from './discharge-requests.service';
import { CreateDischargeRequestDto } from './dto/create-discharge-request.dto';
import { FilterDischargeRequestDto } from './dto/filter-discharge-request.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';

@ApiTags('discharge-requests')
@Controller('discharge-requests')
export class DischargeRequestsController {
  constructor(private readonly dischargeRequestsService: DischargeRequestsService) {}

  // ==================== Public Endpoints (no auth) ====================

  @Post('public')
  @HttpCode(HttpStatus.CREATED)
  createPublic(@Body(ValidationPipe) dto: CreateDischargeRequestDto) {
    return this.dischargeRequestsService.createFromPublicForm(dto);
  }

  @Get('public/available-items')
  getAvailableItems() {
    return this.dischargeRequestsService.getAvailableItems();
  }

  // ==================== Protected Endpoints ====================

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  findAll(@Query(ValidationPipe) filters: FilterDischargeRequestDto) {
    return this.dischargeRequestsService.findAll(filters);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  getStats() {
    return this.dischargeRequestsService.getStats();
  }

  @Get('request-form-qr')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  getRequestFormQr() {
    return this.dischargeRequestsService.getRequestFormQr();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  findOne(@Param('id') id: string) {
    return this.dischargeRequestsService.findOne(id);
  }

  @Patch(':id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  complete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.dischargeRequestsService.complete(id, user.id);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    return this.dischargeRequestsService.reject(id, user.id, reason);
  }
}
