import { Module } from '@nestjs/common';
import { FiscalConfigService } from './fiscal-config.service';
import { FiscalConfigController } from './fiscal-config.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [FiscalConfigController],
  providers: [FiscalConfigService],
  exports: [FiscalConfigService],
})
export class FiscalConfigModule {}
