import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma, OrganizationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantFlagService } from '../tenant/tenant-flag.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

/**
 * Phase 1 implementation. Only SUPER_ADMIN can call any of these (enforced by
 * SuperAdminGuard on the controller); we still call assertEnabled() so that
 * accidental usage while MULTI_TENANT_ENABLED=false yields a 503 instead of
 * touching the org table behind the feature flag.
 */
@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantFlag: TenantFlagService,
  ) {}

  async findAll() {
    this.tenantFlag.assertEnabled();
    return this.prisma.organization.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async findBySlug(slug: string) {
    this.tenantFlag.assertEnabled();
    const org = await this.prisma.organization.findUnique({ where: { slug } });
    if (!org) {
      throw new NotFoundException(`Organization with slug "${slug}" not found`);
    }
    return org;
  }

  async create(dto: CreateOrganizationDto) {
    this.tenantFlag.assertEnabled();
    try {
      return await this.prisma.organization.create({
        data: {
          slug: dto.slug,
          name: dto.name,
          status: OrganizationStatus.ACTIVE,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Organization slug "${dto.slug}" already exists`);
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateOrganizationDto) {
    this.tenantFlag.assertEnabled();
    if (!dto.slug && !dto.name) {
      throw new BadRequestException('At least one field must be provided');
    }
    try {
      return await this.prisma.organization.update({
        where: { id },
        data: {
          ...(dto.slug ? { slug: dto.slug } : {}),
          ...(dto.name ? { name: dto.name } : {}),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2025') {
          throw new NotFoundException(`Organization with id "${id}" not found`);
        }
        if (error.code === 'P2002') {
          throw new ConflictException(`Organization slug "${dto.slug}" already exists`);
        }
      }
      throw error;
    }
  }
}
