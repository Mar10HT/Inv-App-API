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
  ForbiddenException,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { LoansService } from './loans.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto, ReturnLoanDto } from './dto/update-loan.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import { PaginationDto } from '../common/dto';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { PdfReceiptsService } from '../pdf-receipts/pdf-receipts.service';

@Controller('loans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoansController {
  constructor(
    private readonly loansService: LoansService,
    private readonly pdfReceipts: PdfReceiptsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('loans:create')
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
        throw new ForbiddenException(
          'You do not have access to the involved warehouses',
        );
      }
    }
    return this.loansService.create(createLoanDto, user.userId);
  }

  @Get()
  @Permissions('loans:view')
  findAll(
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    pagination: PaginationDto,
    @Query('status') status?: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.findAll(pagination, user.warehouseIds, status);
  }

  @Get('active')
  @Permissions('loans:view')
  findActive(@CurrentUser() user: AuthenticatedUser) {
    return this.loansService.findActive(user.warehouseIds);
  }

  @Get('stats')
  @Permissions('loans:view')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.loansService.getStats(user.warehouseIds);
  }

  @Get('item/:itemId')
  @Permissions('loans:view')
  findByItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.findByItem(itemId, user.warehouseIds);
  }

  @Get('warehouse/:warehouseId')
  @Permissions('loans:view')
  findByWarehouse(
    @Param('warehouseId') warehouseId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.findByWarehouse(warehouseId, user.warehouseIds);
  }

  @Get('check-item/:itemId')
  @Permissions('loans:view')
  async isItemOnLoan(@Param('itemId') itemId: string) {
    const onLoan = await this.loansService.isItemOnLoan(itemId);
    return { onLoan };
  }

  @Get(':id')
  @Permissions('loans:view')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.loansService.findOne(id, user.warehouseIds);
  }

  @Get(':id/pdf')
  @Permissions('loans:view')
  async exportPdf(
    @Param('id') id: string,
    @Query('locale') locale: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const resolvedLocale = locale === 'en' ? 'en' : 'es';
    // Reuse findOne for warehouse-access enforcement before generating
    await this.loansService.findOne(id, user.warehouseIds);
    const buffer = await this.pdfReceipts.generateLoanReceipt(
      id,
      resolvedLocale,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=prestamo_${id}.pdf`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  // ==================== QR Code Endpoints ====================

  @Patch(':id/send')
  @Permissions('loans:manage')
  sendLoan(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.loansService.sendLoan(id, user.userId, user.warehouseIds);
  }

  @Get(':id/qr/:type')
  @Permissions('loans:manage')
  async getQrCode(
    @Param('id') id: string,
    @Param('type') type: 'send' | 'return',
  ) {
    const qrDataUrl = await this.loansService.getQrCode(id, type);
    return { qrDataUrl };
  }

  @Post('confirm-receipt')
  @HttpCode(HttpStatus.OK)
  @Permissions('loans:manage')
  confirmReceipt(
    @Body('qrCode') qrCode: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.confirmReceipt(
      qrCode,
      user.userId,
      user.warehouseIds,
    );
  }

  @Patch(':id/initiate-return')
  @Permissions('loans:manage')
  initiateReturn(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.initiateReturn(id, user.userId, user.warehouseIds);
  }

  @Post('confirm-return')
  @HttpCode(HttpStatus.OK)
  @Permissions('loans:manage')
  confirmReturn(
    @Body('qrCode') qrCode: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.confirmReturn(
      qrCode,
      user.userId,
      user.warehouseIds,
    );
  }

  @Post('scan-qr')
  @HttpCode(HttpStatus.OK)
  @Permissions('loans:manage')
  scanQr(
    @Body('scannedData') scannedData: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.processQrCode(
      scannedData,
      user.userId,
      user.warehouseIds,
    );
  }

  // ==================== Manual Confirmation Endpoints (No QR) ====================

  @Patch(':id/manual-confirm-receipt')
  @Permissions('loans:manage')
  manualConfirmReceipt(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.manualConfirmReceipt(
      id,
      user.userId,
      user.warehouseIds,
    );
  }

  @Patch(':id/manual-confirm-return')
  @Permissions('loans:manage')
  manualConfirmReturn(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.manualConfirmReturn(
      id,
      user.userId,
      user.warehouseIds,
    );
  }

  // ==================== Standard Endpoints ====================

  @Patch(':id')
  @Permissions('loans:manage')
  update(
    @Param('id') id: string,
    @Body(ValidationPipe) updateLoanDto: UpdateLoanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.update(id, updateLoanDto, user.warehouseIds);
  }

  @Patch(':id/return')
  @Permissions('loans:manage')
  returnLoan(
    @Param('id') id: string,
    @Body(ValidationPipe) returnLoanDto: ReturnLoanDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.loansService.returnLoan(id, returnLoanDto, user.warehouseIds);
  }

  @Patch(':id/cancel')
  @Permissions('loans:manage')
  cancelLoan(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.loansService.cancel(id, user.userId, user.warehouseIds);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Permissions('loans:delete')
  async remove(@Param('id') id: string) {
    await this.loansService.remove(id);
  }

  @Post('check-overdue')
  @Permissions('loans:manage')
  async checkOverdueLoans(@CurrentUser() user: AuthenticatedUser) {
    await this.loansService.checkOverdueLoans(user.warehouseIds);
    return { message: 'Overdue loans checked and updated' };
  }
}
