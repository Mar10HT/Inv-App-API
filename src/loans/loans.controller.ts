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
} from '@nestjs/common';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto, ReturnLoanDto } from './dto/update-loan.dto';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { PaginationDto } from '../common/dto';

@Controller('loans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  create(
    @Body(ValidationPipe) createLoanDto: CreateLoanDto,
    @Request() req: { user: { userId: string } },
  ) {
    return this.loansService.create(createLoanDto, req.user.userId);
  }

  @Get()
  findAll(@Query(ValidationPipe) pagination: PaginationDto) {
    return this.loansService.findAll(pagination);
  }

  @Get('active')
  findActive() {
    return this.loansService.findActive();
  }

  @Get('stats')
  getStats() {
    return this.loansService.getStats();
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

  /**
   * Send loan - generates QR code for receipt confirmation
   */
  @Patch(':id/send')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  sendLoan(@Param('id') id: string) {
    return this.loansService.sendLoan(id);
  }

  /**
   * Get QR code image for a loan
   */
  @Get(':id/qr/:type')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  async getQrCode(
    @Param('id') id: string,
    @Param('type') type: 'send' | 'return',
  ) {
    const qrDataUrl = await this.loansService.getQrCode(id, type);
    return { qrDataUrl };
  }

  /**
   * Confirm receipt by QR code
   */
  @Post('confirm-receipt')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  confirmReceipt(
    @Body('qrCode') qrCode: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.loansService.confirmReceipt(qrCode, req.user.userId);
  }

  /**
   * Initiate return - generates QR code for return confirmation
   */
  @Patch(':id/initiate-return')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  initiateReturn(@Param('id') id: string) {
    return this.loansService.initiateReturn(id);
  }

  /**
   * Confirm return by QR code
   */
  @Post('confirm-return')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  confirmReturn(
    @Body('qrCode') qrCode: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.loansService.confirmReturn(qrCode, req.user.userId);
  }

  /**
   * Process scanned QR code (auto-detect type)
   */
  @Post('scan-qr')
  @HttpCode(HttpStatus.OK)
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  scanQr(
    @Body('scannedData') scannedData: string,
    @Request() req: { user: { userId: string } },
  ) {
    return this.loansService.processQrCode(scannedData, req.user.userId);
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

  /**
   * Legacy return endpoint (without QR confirmation)
   */
  @Patch(':id/return')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER')
  returnLoan(
    @Param('id') id: string,
    @Body(ValidationPipe) returnLoanDto: ReturnLoanDto,
  ) {
    return this.loansService.returnLoan(id, returnLoanDto);
  }

  /**
   * Cancel a loan
   */
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
