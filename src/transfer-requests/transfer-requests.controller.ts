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
import { TransferRequestsService } from './transfer-requests.service';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequestStatus } from '@prisma/client';

@Controller('transfer-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TransferRequestsController {
  constructor(private readonly transferRequestsService: TransferRequestsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  create(
    @Body(ValidationPipe) dto: CreateTransferRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.transferRequestsService.create(dto, user.id);
  }

  @Get()
  findAll(
    @Query(ValidationPipe) pagination: PaginationDto,
    @Query('status') status?: RequestStatus,
  ) {
    return this.transferRequestsService.findAll(pagination, status);
  }

  @Get('pending')
  findPending(@Query(ValidationPipe) pagination: PaginationDto) {
    return this.transferRequestsService.findPending(pagination);
  }

  @Get('stats')
  getStats() {
    return this.transferRequestsService.getStats();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transferRequestsService.findOne(id);
  }

  @Patch(':id/approve')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.transferRequestsService.approve(id, user.id);
  }

  @Patch(':id/reject')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    return this.transferRequestsService.reject(id, user.id, reason);
  }

  @Patch(':id/complete')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  complete(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.transferRequestsService.complete(id, user.id);
  }

  @Patch(':id/cancel')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.transferRequestsService.cancel(id, user.id);
  }
}
