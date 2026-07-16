import { Module } from '@nestjs/common';
import { TransferRequestsService } from './transfer-requests.service';
import { TransferRequestsController } from './transfer-requests.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { QrModule } from '../qr/qr.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PdfReceiptsModule } from '../pdf-receipts/pdf-receipts.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    QrModule,
    PermissionsModule,
    PdfReceiptsModule,
  ],
  controllers: [TransferRequestsController],
  providers: [TransferRequestsService],
  exports: [TransferRequestsService],
})
export class TransferRequestsModule {}
