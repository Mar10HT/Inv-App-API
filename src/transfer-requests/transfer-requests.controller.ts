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
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiQuery } from '@nestjs/swagger';
import { TransferRequestsService } from './transfer-requests.service';
import { CreateTransferRequestDto } from './dto/create-transfer-request.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { PaginationDto } from '../common/dto/pagination.dto';
import { RequestStatus } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Validate user has access to at least one of the warehouses
    if (user.warehouseIds !== null) {
      const hasAccess =
        user.warehouseIds.includes(dto.sourceWarehouseId) ||
        user.warehouseIds.includes(dto.destinationWarehouseId);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to the involved warehouses');
      }
    }
    return this.transferRequestsService.create(dto, user.userId);
  }

  @Get()
  @ApiQuery({ name: 'status', enum: ['PENDING', 'APPROVED', 'SENT', 'COMPLETED', 'REJECTED', 'CANCELLED'], required: false })
  findAll(
    @Query(ValidationPipe) pagination: PaginationDto,
    @Query('status') status?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.transferRequestsService.findAll(pagination, status as RequestStatus, user?.warehouseIds);
  }

  @Get('pending')
  findPending(
    @Query(ValidationPipe) pagination: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transferRequestsService.findPending(pagination, user.warehouseIds);
  }

  @Get('stats')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.transferRequestsService.getStats(user.warehouseIds);
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
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transferRequestsService.confirmReceipt(qrCode, user.userId);
  }

  @Post('scan-qr')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  processQrCode(
    @Body('scannedData') scannedData: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transferRequestsService.processQrCode(scannedData, user.userId);
  }

  // ==================== Standard Operations ====================

  @Patch(':id/approve')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  approve(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transferRequestsService.approve(id, user.userId);
  }

  @Patch(':id/reject')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transferRequestsService.reject(id, user.userId, reason);
  }

  @Patch(':id/complete')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  complete(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transferRequestsService.complete(id, user.userId);
  }

  @Patch(':id/cancel')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.transferRequestsService.cancel(id, user.userId);
  }
}
