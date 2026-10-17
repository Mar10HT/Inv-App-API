import { Module } from '@nestjs/common';
import { PurchaseInvoicesService } from './purchase-invoices.service';
import { PurchaseInvoicesController } from './purchase-invoices.controller';
import { PurchaseNumberingService } from './purchase-numbering.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PdfReceiptsModule } from '../pdf-receipts/pdf-receipts.module';

@Module({
  imports: [PrismaModule, AuditModule, PermissionsModule, PdfReceiptsModule],
  controllers: [PurchaseInvoicesController],
  providers: [PurchaseInvoicesService, PurchaseNumberingService],
  exports: [PurchaseInvoicesService],
})
export class PurchaseInvoicesModule {}
