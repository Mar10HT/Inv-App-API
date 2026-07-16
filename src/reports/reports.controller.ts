import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard, PermissionsGuard } from '../auth/guards';
import { Permissions, CurrentUser } from '../auth/decorators';
import { FilterInventoryDto } from '../inventory/dto/filter-inventory.dto';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';
import { resolveWarehouseScope } from '../common/warehouse-access/warehouse-filter.util';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  private scope(
    user: AuthenticatedUser,
    warehouseId?: string,
  ): string[] | null {
    try {
      return resolveWarehouseScope(user.warehouseIds, warehouseId);
    } catch {
      throw new ForbiddenException('You do not have access to this warehouse');
    }
  }

  @Get('inventory/excel')
  @Permissions('reports:export')
  async exportInventoryExcel(
    @Query(ValidationPipe) filters: FilterInventoryDto,
    @Query('locale') locale: 'en' | 'es' = 'es',
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.generateInventoryExcel(
      filters,
      user.warehouseIds,
      locale,
    );

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=inventario_${Date.now()}.xlsx`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('inventory/pdf')
  @Permissions('reports:export')
  async exportInventoryPdf(
    @Query(ValidationPipe) filters: FilterInventoryDto,
    @Query('locale') locale: 'en' | 'es' = 'es',
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.generateInventoryPdf(
      filters,
      user.warehouseIds,
      locale,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=inventario_${Date.now()}.pdf`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('low-stock/excel')
  @Permissions('reports:export')
  async exportLowStockExcel(
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('locale') locale: 'en' | 'es' = 'es',
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const scope = this.scope(user, warehouseId);
    const buffer = await this.reportsService.generateLowStockReport(
      scope,
      locale,
    );

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=stock_bajo_${Date.now()}.xlsx`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('transactions/excel')
  @Permissions('reports:export')
  async exportTransactionsExcel(
    @Query('startDate') startDate: string | undefined,
    @Query('endDate') endDate: string | undefined,
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('locale') locale: 'en' | 'es' = 'es',
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    if (start && isNaN(start.getTime())) {
      throw new BadRequestException('Invalid startDate format');
    }
    if (end && isNaN(end.getTime())) {
      throw new BadRequestException('Invalid endDate format');
    }

    const scope = this.scope(user, warehouseId);
    const buffer = await this.reportsService.generateTransactionsReport(
      start,
      end,
      scope,
      locale,
    );

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=transacciones_${Date.now()}.xlsx`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('loans/excel')
  @Permissions('reports:export')
  async exportLoansExcel(
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('locale') locale: 'en' | 'es' = 'es',
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const scope = this.scope(user, warehouseId);
    const buffer = await this.reportsService.generateLoansReport(scope, locale);

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=prestamos_${Date.now()}.xlsx`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('transfers/excel')
  @Permissions('reports:export')
  async exportTransfersExcel(
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('locale') locale: 'en' | 'es' = 'es',
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const scope = this.scope(user, warehouseId);
    const buffer = await this.reportsService.generateTransferRequestsReport(
      scope,
      locale,
    );

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=transferencias_${Date.now()}.xlsx`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('stock-takes/excel')
  @Permissions('reports:export')
  async exportStockTakesExcel(
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('locale') locale: 'en' | 'es' = 'es',
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const scope = this.scope(user, warehouseId);
    const buffer = await this.reportsService.generateStockTakeReport(
      scope,
      locale,
    );

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=conteo_fisico_${Date.now()}.xlsx`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('discharges/excel')
  @Permissions('reports:export')
  async exportDischargesExcel(
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('locale') locale: 'en' | 'es' = 'es',
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const scope = this.scope(user, warehouseId);
    const buffer = await this.reportsService.generateDischargesReport(
      scope,
      locale,
    );

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=bajas_${Date.now()}.xlsx`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('outflows/excel')
  @Permissions('reports:export')
  async exportOutflowsExcel(
    @Query('warehouseId') warehouseId: string | undefined,
    @Query('locale') locale: 'en' | 'es' = 'es',
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const scope = this.scope(user, warehouseId);
    const buffer = await this.reportsService.generateOutflowsReport(
      scope,
      locale,
    );

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=salidas_${Date.now()}.xlsx`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }
}
