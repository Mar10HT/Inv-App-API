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
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { CancelSaleDto } from './dto/cancel-sale.dto';
import { FilterSaleDto } from './dto/filter-sale.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { PdfReceiptsService } from '../pdf-receipts/pdf-receipts.service';

@Controller('sales')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly pdfReceipts: PdfReceiptsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('sales:create')
  create(
    @Body(new ValidationPipe({ whitelist: true, transform: true })) dto: CreateSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.create(dto, user.userId, user.warehouseIds);
  }

  @Get()
  @Permissions('sales:view')
  findAll(
    @Query(new ValidationPipe({ whitelist: true, transform: true })) filters: FilterSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.findAll(filters, user.warehouseIds);
  }

  @Get('stats')
  @Permissions('sales:view')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.salesService.getStats(user.warehouseIds);
  }

  @Get(':id')
  @Permissions('sales:view')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.salesService.findOne(id, user.warehouseIds);
  }

  @Get(':id/pdf')
  @Permissions('sales:view')
  async exportPdf(
    @Param('id') id: string,
    @Query('locale') locale: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const resolvedLocale = locale === 'en' ? 'en' : 'es';
    await this.salesService.findOne(id, user.warehouseIds);
    const buffer = await this.pdfReceipts.generateSaleReceipt(id, resolvedLocale);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=venta_${id}.pdf`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Patch(':id/cancel')
  @Permissions('sales:cancel')
  cancel(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: CancelSaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.salesService.cancel(id, user.userId, dto.reason, user.warehouseIds);
  }
}
