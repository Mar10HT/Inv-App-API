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
import { TransferRequestsService } from './transfer-requests.service';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequestStatus } from '@prisma/client';

@ApiTags('transfer-requests')
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
  @ApiQuery({ name: 'status', enum: ['PENDING', 'APPROVED', 'SENT', 'COMPLETED', 'REJECTED', 'CANCELLED'], required: false })
  findAll(
    @Query(ValidationPipe) pagination: PaginationDto,
    @Query('status') status?: string,
  ) {
    return this.transferRequestsService.findAll(pagination, status as RequestStatus);
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

  // ==================== QR-Based Operations ====================

  @Get(':id/qr')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  getQrCode(@Param('id') id: string) {
    return this.transferRequestsService.getQrCode(id);
  }

  @Patch(':id/send')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  sendTransfer(@Param('id') id: string) {
    return this.transferRequestsService.sendTransfer(id);
  }

  @Post('confirm-receipt')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  confirmReceipt(
    @Body('qrCode') qrCode: string,
    @CurrentUser() user: any,
  ) {
    return this.transferRequestsService.confirmReceipt(qrCode, user.id);
  }

  @Post('scan-qr')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  processQrCode(
    @Body('scannedData') scannedData: string,
    @CurrentUser() user: any,
  ) {
    return this.transferRequestsService.processQrCode(scannedData, user.id);
  }

  // ==================== Standard Operations ====================

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
