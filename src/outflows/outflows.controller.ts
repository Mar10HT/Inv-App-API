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
import { OutflowsService } from './outflows.service';
import { CreateOutflowDto } from './dto/create-outflow.dto';
import { CancelOutflowDto } from './dto/cancel-outflow.dto';
import { FilterOutflowDto } from './dto/filter-outflow.dto';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import type { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { PdfReceiptsService } from '../pdf-receipts/pdf-receipts.service';

@Controller('outflows')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OutflowsController {
  constructor(
    private readonly outflowsService: OutflowsService,
    private readonly pdfReceipts: PdfReceiptsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Permissions('outflows:create')
  create(
    @Body(new ValidationPipe({ whitelist: true, transform: true }))
    dto: CreateOutflowDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.outflowsService.create(dto, user.userId, user.warehouseIds);
  }

  @Get()
  @Permissions('outflows:view')
  findAll(
    @Query(new ValidationPipe({ whitelist: true, transform: true }))
    filters: FilterOutflowDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.outflowsService.findAll(filters, user.warehouseIds);
  }

  @Get('stats')
  @Permissions('outflows:view')
  getStats(@CurrentUser() user: AuthenticatedUser) {
    return this.outflowsService.getStats(user.warehouseIds);
  }

  @Get(':id')
  @Permissions('outflows:view')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.outflowsService.findOne(id, user.warehouseIds);
  }

  @Get(':id/pdf')
  @Permissions('outflows:view')
  async exportPdf(
    @Param('id') id: string,
    @Query('locale') locale: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const resolvedLocale = locale === 'en' ? 'en' : 'es';
    await this.outflowsService.findOne(id, user.warehouseIds);
    const buffer = await this.pdfReceipts.generateOutflowReceipt(
      id,
      resolvedLocale,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=salida_${id}.pdf`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  @Patch(':id/cancel')
  @Permissions('outflows:cancel')
  cancel(
    @Param('id') id: string,
    @Body(new ValidationPipe({ whitelist: true })) dto: CancelOutflowDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.outflowsService.cancel(
      id,
      user.userId,
      dto.reason,
      user.warehouseIds,
    );
  }
}
