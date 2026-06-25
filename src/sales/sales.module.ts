import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PdfReceiptsModule } from '../pdf-receipts/pdf-receipts.module';

@Module({
  imports: [PrismaModule, AuditModule, PermissionsModule, PdfReceiptsModule],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
