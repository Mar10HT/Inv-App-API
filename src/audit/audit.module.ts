import { Module, Global } from '@nestjs/common';
import { AuditService } from './audit.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { AuditController } from './audit.controller';

@Global() // Make it available globally without importing
@Module({
  imports: [PermissionsModule],
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
