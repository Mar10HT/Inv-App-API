import { Global, Module } from '@nestjs/common';
import { TenantFlagService } from './tenant-flag.service';

@Global()
@Module({
  providers: [TenantFlagService],
  exports: [TenantFlagService],
})
export class TenantModule {}
