import { Module } from '@nestjs/common';
import { ScheduledReportsService } from './scheduled-reports.service';
import { ScheduledReportsController } from './scheduled-reports.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ReportsModule } from '../reports/reports.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, ReportsModule, PermissionsModule],
  controllers: [ScheduledReportsController],
  providers: [ScheduledReportsService],
})
export class ScheduledReportsModule {}
