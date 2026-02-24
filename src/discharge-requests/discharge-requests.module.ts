import { Module } from '@nestjs/common';
import { DischargeRequestsService } from './discharge-requests.service';
import { DischargeRequestsController } from './discharge-requests.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [DischargeRequestsController],
  providers: [DischargeRequestsService],
  exports: [DischargeRequestsService],
})
export class DischargeRequestsModule {}
