import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { TenantFlagService } from '../tenant/tenant-flag.service';
import { OrganizationsMaintenanceService } from './organizations-maintenance.service';

describe('OrganizationsMaintenanceService', () => {
  const prismaMock = {
    organization: { findMany: jest.fn() },
    refreshToken: { updateMany: jest.fn() },
  };

  const buildService = async (flagEnabled: boolean): Promise<OrganizationsMaintenanceService> => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsMaintenanceService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: TenantFlagService,
          useValue: { isEnabled: () => flagEnabled, assertEnabled: jest.fn() },
        },
      ],
    }).compile();
    return module.get(OrganizationsMaintenanceService);
  };

  it('cron entry is a no-op when MULTI_TENANT_ENABLED is false', async () => {
    const svc = await buildService(false);
    await svc.revokeTokensForInactiveOrgs();
    expect(prismaMock.organization.findMany).not.toHaveBeenCalled();
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('returns 0/0 when there are no inactive orgs', async () => {
    const svc = await buildService(true);
    prismaMock.organization.findMany.mockResolvedValue([]);

    const result = await svc.runRevokeOnce();

    expect(result).toEqual({ orgsAffected: 0, tokensRevoked: 0 });
    expect(prismaMock.refreshToken.updateMany).not.toHaveBeenCalled();
  });

  it('revokes refresh tokens for SUSPENDED and ARCHIVED orgs', async () => {
    const svc = await buildService(true);
    prismaMock.organization.findMany.mockResolvedValue([
      { id: 'org_a', status: 'SUSPENDED', slug: 'A' },
      { id: 'org_b', status: 'ARCHIVED', slug: 'B' },
    ]);
    prismaMock.refreshToken.updateMany.mockResolvedValue({ count: 7 });

    const result = await svc.runRevokeOnce();

    expect(result).toEqual({ orgsAffected: 2, tokensRevoked: 7 });
    expect(prismaMock.refreshToken.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: { in: ['org_a', 'org_b'] },
        revoked: false,
      },
      data: { revoked: true },
    });
  });

  it('cron entry delegates to runRevokeOnce when flag is enabled', async () => {
    const svc = await buildService(true);
    prismaMock.organization.findMany.mockResolvedValue([]);

    await svc.revokeTokensForInactiveOrgs();

    expect(prismaMock.organization.findMany).toHaveBeenCalled();
  });
});
