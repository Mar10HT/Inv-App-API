import { Global, Module } from '@nestjs/common';
import { WarehouseAccessService } from './warehouse-access.service';

@Global()
@Module({
  providers: [WarehouseAccessService],
  exports: [WarehouseAccessService],
})
export class WarehouseAccessModule {}
