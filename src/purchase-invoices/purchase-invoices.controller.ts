import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { CreatePurchaseInvoiceDto } from './dto/create-purchase-invoice.dto';
import { CancelPurchaseInvoiceDto } from './dto/cancel-purchase-invoice.dto';
import { FilterPurchaseInvoiceDto } from './dto/filter-purchase-invoice.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { PdfReceiptsService } from '../pdf-receipts/pdf-receipts.service';

@Controller('purchase-invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchaseInvoicesController {
  constructor(
    private readonly purchaseInvoicesService: PurchaseInvoicesService,
    private readonly pdfReceipts: PdfReceiptsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('purchases:create')
  create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreatePurchaseInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseInvoicesService.create(
      dto,
      user.userId,
      user.warehouseIds,
    );
  }

  @Get()
  @Permissions('purchases:view')
  findAll(
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    filters: FilterPurchaseInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseInvoicesService.findAll(filters, user.warehouseIds);
  }

  @Get('stats')
  @Permissions('purchases:view')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.purchaseInvoicesService.getStats(user.warehouseIds);
  }

  @Get(':id')
  @Permissions('purchases:view')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.purchaseInvoicesService.findOne(id, user.warehouseIds);
  }

  @Get(':id/pdf')
  @Permissions('purchases:view')
  async exportPdf(
    @Param('id') id: string,
    @Query('locale') locale: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const resolvedLocale = locale === 'en' ? 'en' : 'es';
    await this.purchaseInvoicesService.findOne(id, user.warehouseIds);
    const buffer = await this.pdfReceipts.generatePurchaseReceipt(
      id,
      resolvedLocale,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=compra_${id}.pdf`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Patch(':id/cancel')
  @Permissions('purchases:cancel')
  cancel(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true }))
    dto: CancelPurchaseInvoiceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.purchaseInvoicesService.cancel(
      id,
      user.userId,
      dto.reason,
      user.warehouseIds,
    );
  }
}
