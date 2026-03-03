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
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

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
  findAll(
    @Query(ValidationPipe) filters: FilterDischargeRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dischargeRequestsService.findAll(filters, user.warehouseIds);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dischargeRequestsService.getStats(user.warehouseIds);
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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dischargeRequestsService.complete(id, user.userId);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dischargeRequestsService.reject(id, user.userId, reason);
  }
}
