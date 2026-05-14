import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationsMaintenanceService } from './organizations-maintenance.service';

@Module({
  imports: [TenantModule],
  controllers: [OrganizationsController],
  providers: [OrganizationsService, OrganizationsMaintenanceService],
  exports: [OrganizationsService, OrganizationsMaintenanceService],
})
export class OrganizationsModule {}
