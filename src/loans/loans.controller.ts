import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ValidationPipe,
  Query,
  UseGuards,
  Request,
  ForbiddenException,
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto, ReturnLoanDto } from './dto/update-loan.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { PaginationDto } from '../common/dto';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@Controller('loans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  create(
    @Body(ValidationPipe) createLoanDto: CreateLoanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Validate user has access to at least one of the warehouses involved
    if (user.warehouseIds !== null) {
      const hasAccess =
        user.warehouseIds.includes(createLoanDto.sourceWarehouseId) ||
        user.warehouseIds.includes(createLoanDto.destinationWarehouseId);
      if (!hasAccess) {
        throw new ForbiddenException('You do not have access to the involved warehouses');
      }
    }
    return this.loansService.create(createLoanDto, user.userId);
  }

  @Get()
  findAll(
    @Query(ValidationPipe) pagination: PaginationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.findAll(pagination, user.warehouseIds);
  }

  @Get('active')
  findActive(@CurrentUser() user: AuthenticatedUser) {
    return this.loansService.findActive(user.warehouseIds);
  }

  @Get('stats')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.loansService.getStats(user.warehouseIds);
  }

  @Get('item/:itemId')
  findByItem(@Param('itemId') itemId: string) {
    return this.loansService.findByItem(itemId);
  }

  @Get('warehouse/:warehouseId')
  findByWarehouse(@Param('warehouseId') warehouseId: string) {
    return this.loansService.findByWarehouse(warehouseId);
  }

  @Get('check-item/:itemId')
  async isItemOnLoan(@Param('itemId') itemId: string) {
    const onLoan = await this.loansService.isItemOnLoan(itemId);
    return { onLoan };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.loansService.findOne(id);
  }

  // ==================== QR Code Endpoints ====================

  @Patch(':id/send')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  sendLoan(@Param('id') id: string) {
    return this.loansService.sendLoan(id);
  }

  @Get(':id/qr/:type')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  async getQrCode(
    @Param('id') id: string,
    @Param('type') type: 'send' | 'return',
  ) {
    const qrDataUrl = await this.loansService.getQrCode(id, type);
    return { qrDataUrl };
  }

  @Post('confirm-receipt')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  confirmReceipt(
    @Body('qrCode') qrCode: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.confirmReceipt(qrCode, user.userId);
  }

  @Patch(':id/initiate-return')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  initiateReturn(@Param('id') id: string) {
    return this.loansService.initiateReturn(id);
  }

  @Post('confirm-return')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  confirmReturn(
    @Body('qrCode') qrCode: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.confirmReturn(qrCode, user.userId);
  }

  @Post('scan-qr')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  scanQr(
    @Body('scannedData') scannedData: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.processQrCode(scannedData, user.userId);
  }

  // ==================== Standard Endpoints ====================

  @Patch(':id')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateLoanDto: UpdateLoanDto,
  ) {
    return this.loansService.update(id, updateLoanDto);
  }

  @Patch(':id/return')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  returnLoan(
    @Param('id') id: string,
    @Body(ValidationPipe) returnLoanDto: ReturnLoanDto,
  ) {
    return this.loansService.returnLoan(id, returnLoanDto);
  }

  @Patch(':id/cancel')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  cancelLoan(@Param('id') id: string) {
    return this.loansService.cancel(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('SYSTEM_ADMIN')
  async remove(@Param('id') id: string) {
    await this.loansService.remove(id);
  }

  @Post('check-overdue')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  async checkOverdueLoans() {
    await this.loansService.checkOverdueLoans();
    return { message: 'Overdue loans checked and updated' };
  }
}
