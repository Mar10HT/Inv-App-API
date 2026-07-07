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
import { Throttle } from '@nestjs/throttler';
import { DischargeRequestsService } from './discharge-requests.service';
import { CreateDischargeRequestDto } from './dto/create-discharge-request.dto';
import { FilterDischargeRequestDto } from './dto/filter-discharge-request.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@ApiTags('discharge-requests')
@Controller('discharge-requests')
export class DischargeRequestsController {
  constructor(
    private readonly dischargeRequestsService: DischargeRequestsService,
  ) {}

  // ==================== Public Endpoints (no auth) ====================

  @Post('public')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  createPublic(@Body(ValidationPipe) dto: CreateDischargeRequestDto) {
    return this.dischargeRequestsService.createFromPublicForm(dto);
  }

  @Get('public/available-items')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  getAvailableItems() {
    return this.dischargeRequestsService.getAvailableItems();
  }

  // ==================== Protected Endpoints ====================

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('discharges:view')
  findAll(
    @Query(ValidationPipe) filters: FilterDischargeRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dischargeRequestsService.findAll(filters, user.warehouseIds);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('discharges:view')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.dischargeRequestsService.getStats(user.warehouseIds);
  }

  @Get('request-form-qr')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('discharges:manage')
  getRequestFormQr() {
    return this.dischargeRequestsService.getRequestFormQr();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('discharges:view')
  findOne(@Param('id') id: string) {
    return this.dischargeRequestsService.findOne(id);
  }

  @Patch(':id/complete')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('discharges:manage')
  complete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.dischargeRequestsService.complete(id, user.userId);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('discharges:manage')
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.dischargeRequestsService.reject(id, user.userId, reason);
  }
}
