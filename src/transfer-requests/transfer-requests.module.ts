import { Module } from '@nestjs/common';
import { TransferRequestsService } from './transfer-requests.service';
import { TransferRequestsController } from './transfer-requests.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [TransferRequestsController],
  providers: [TransferRequestsService],
  exports: [TransferRequestsService],
})
export class TransferRequestsModule {}
