import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantFlagService } from '../tenant/tenant-flag.service';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  const prismaMock = {
    organization: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const buildService = async (enabled: boolean): Promise<OrganizationsService> => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        { provide: PrismaService, useValue: prismaMock },
        {
          provide: TenantFlagService,
          useValue: {
            isEnabled: () => enabled,
            assertEnabled: () => {
              if (!enabled) throw new ServiceUnavailableException('Multi-tenant mode is disabled');
            },
          },
        },
      ],
    }).compile();

    return module.get(OrganizationsService);
  };

  describe('feature flag gating', () => {
    it('findAll throws ServiceUnavailable when flag is off', async () => {
      const service = await buildService(false);
      await expect(service.findAll()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('create throws ServiceUnavailable when flag is off', async () => {
      const service = await buildService(false);
      await expect(
        service.create({ slug: 'ON', name: 'Olancho Net' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('findBySlug throws ServiceUnavailable when flag is off', async () => {
      const service = await buildService(false);
      await expect(service.findBySlug('ON')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('update throws ServiceUnavailable when flag is off', async () => {
      const service = await buildService(false);
      await expect(
        service.update('org_x', { name: 'New' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('when flag is enabled', () => {
    it('findAll returns orgs sorted by createdAt asc', async () => {
      const service = await buildService(true);
      const fake = [{ id: 'org_on', slug: 'ON', name: 'Olancho Net' }];
      prismaMock.organization.findMany.mockResolvedValue(fake);

      const result = await service.findAll();
      expect(result).toBe(fake);
      expect(prismaMock.organization.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'asc' },
      });
    });

    it('findBySlug returns the org', async () => {
      const service = await buildService(true);
      const fake = { id: 'org_on', slug: 'ON', name: 'Olancho Net' };
      prismaMock.organization.findUnique.mockResolvedValue(fake);

      const result = await service.findBySlug('ON');
      expect(result).toBe(fake);
      expect(prismaMock.organization.findUnique).toHaveBeenCalledWith({ where: { slug: 'ON' } });
    });

    it('findBySlug throws NotFound when slug is missing', async () => {
      const service = await buildService(true);
      prismaMock.organization.findUnique.mockResolvedValue(null);

      await expect(service.findBySlug('GHOST')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('create persists with ACTIVE status', async () => {
      const service = await buildService(true);
      const created = { id: 'org_xyz', slug: 'ACME', name: 'Acme', status: 'ACTIVE' };
      prismaMock.organization.create.mockResolvedValue(created);

      const result = await service.create({ slug: 'ACME', name: 'Acme' });
      expect(result).toBe(created);
      expect(prismaMock.organization.create).toHaveBeenCalledWith({
        data: { slug: 'ACME', name: 'Acme', status: 'ACTIVE' },
      });
    });

    it('create translates P2002 into Conflict', async () => {
      const service = await buildService(true);
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'x',
      } as never);
      prismaMock.organization.create.mockRejectedValue(p2002);

      await expect(
        service.create({ slug: 'ON', name: 'dup' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('update rejects empty DTO', async () => {
      const service = await buildService(true);
      await expect(service.update('org_on', {})).rejects.toBeInstanceOf(BadRequestException);
      expect(prismaMock.organization.update).not.toHaveBeenCalled();
    });

    it('update translates P2025 into NotFound', async () => {
      const service = await buildService(true);
      const p2025 = new Prisma.PrismaClientKnownRequestError('missing', {
        code: 'P2025',
        clientVersion: 'x',
      } as never);
      prismaMock.organization.update.mockRejectedValue(p2025);

      await expect(
        service.update('org_ghost', { name: 'New' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('update translates P2002 (slug collision) into Conflict', async () => {
      const service = await buildService(true);
      const p2002 = new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'x',
      } as never);
      prismaMock.organization.update.mockRejectedValue(p2002);

      await expect(
        service.update('org_on', { slug: 'TAKEN' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
