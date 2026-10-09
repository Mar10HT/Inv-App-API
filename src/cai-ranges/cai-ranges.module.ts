import { Module } from '@nestjs/common';
import { CaiRangesService } from './cai-ranges.service';
import { CaiRangesController } from './cai-ranges.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [CaiRangesController],
  providers: [CaiRangesService],
  exports: [CaiRangesService],
})
export class CaiRangesModule {}
