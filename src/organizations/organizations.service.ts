import { Injectable, NotImplementedException } from '@nestjs/common';
import { TenantFlagService } from '../tenant/tenant-flag.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

/**
 * Skeleton for Phase 0. The Organization Prisma model, persistence, and tenant
 * scoping wiring land in Phase 1. All methods short-circuit on the feature flag
 * first, then throw NotImplemented until the model exists.
 */
@Injectable()
export class OrganizationsService {
  constructor(private readonly tenantFlag: TenantFlagService) {}

  async findAll(): Promise<never> {
    this.tenantFlag.assertEnabled();
    throw new NotImplementedException('OrganizationsService.findAll lands in Phase 1');
  }

  async findBySlug(_slug: string): Promise<never> {
    this.tenantFlag.assertEnabled();
    throw new NotImplementedException('OrganizationsService.findBySlug lands in Phase 1');
  }

  async create(_dto: CreateOrganizationDto): Promise<never> {
    this.tenantFlag.assertEnabled();
    throw new NotImplementedException('OrganizationsService.create lands in Phase 1');
  }

  async update(_id: string, _dto: UpdateOrganizationDto): Promise<never> {
    this.tenantFlag.assertEnabled();
    throw new NotImplementedException('OrganizationsService.update lands in Phase 1');
  }
}
