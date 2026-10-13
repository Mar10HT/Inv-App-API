import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { StockMovementsService } from './stock-movements.service';
import { ReportsController } from './reports.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [ReportsController],
  providers: [ReportsService, StockMovementsService],
  exports: [ReportsService],
})
export class ReportsModule {}
