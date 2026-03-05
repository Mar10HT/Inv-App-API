import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  ValidationPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, CurrentUser } from '../auth/decorators';
import { FilterInventoryDto } from '../inventory/dto/filter-inventory.dto';
import { AuthenticatedUser } from '../auth/interfaces/auth-user.interface';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('inventory/excel')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER', 'VIEWER')
  async exportInventoryExcel(
    @Query(ValidationPipe) filters: FilterInventoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.generateInventoryExcel(filters, user.warehouseIds);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=inventario_${Date.now()}.xlsx`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('inventory/pdf')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER', 'USER', 'VIEWER')
  async exportInventoryPdf(
    @Query(ValidationPipe) filters: FilterInventoryDto,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.generateInventoryPdf(filters, user.warehouseIds);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename=inventario_${Date.now()}.pdf`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('low-stock/excel')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  async exportLowStockExcel(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.generateLowStockReport(user.warehouseIds);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=stock_bajo_${Date.now()}.xlsx`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('transactions/excel')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  async exportTransactionsExcel(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser() user?: AuthenticatedUser,
    @Res() res?: Response,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    if (start && isNaN(start.getTime())) {
      throw new BadRequestException('Invalid startDate format');
    }
    if (end && isNaN(end.getTime())) {
      throw new BadRequestException('Invalid endDate format');
    }

    const buffer = await this.reportsService.generateTransactionsReport(start, end, user?.warehouseIds);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=transacciones_${Date.now()}.xlsx`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }

  @Get('loans/excel')
  @Roles('SYSTEM_ADMIN', 'WAREHOUSE_MANAGER')
  async exportLoansExcel(
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const buffer = await this.reportsService.generateLoansReport(user.warehouseIds);

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename=prestamos_${Date.now()}.xlsx`,
      'Content-Length': buffer.length,
    });

    res.send(buffer);
  }
}
