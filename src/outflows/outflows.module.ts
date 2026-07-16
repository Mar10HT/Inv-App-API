import { Module } from '@nestjs/common';
import { OutflowsService } from './outflows.service';
import { OutflowsController } from './outflows.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PdfReceiptsModule } from '../pdf-receipts/pdf-receipts.module';

@Module({
  imports: [PrismaModule, AuditModule, PermissionsModule, PdfReceiptsModule],
  controllers: [OutflowsController],
  providers: [OutflowsService],
  exports: [OutflowsService],
})
export class OutflowsModule {}
