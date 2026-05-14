import { Global, Module } from '@nestjs/common';
import { TenantFlagService } from './tenant-flag.service';
import { TenantContextService } from './tenant-context.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';

@Global()
@Module({
  providers: [TenantFlagService, TenantContextService, TenantContextInterceptor],
  exports: [TenantFlagService, TenantContextService, TenantContextInterceptor],
})
export class TenantModule {}
