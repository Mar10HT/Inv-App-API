import { NotImplementedException, ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantFlagService } from '../tenant/tenant-flag.service';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsService', () => {
  const buildService = async (enabled: boolean): Promise<OrganizationsService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: TenantFlagService,
          useValue: { isEnabled: () => enabled, assertEnabled: () => {
            if (!enabled) throw new ServiceUnavailableException('Multi-tenant mode is disabled');
          } },
        },
      ],
    }).compile();

    return module.get(OrganizationsService);
  };

  describe('when MULTI_TENANT_ENABLED is false', () => {
    it('findAll throws ServiceUnavailable', async () => {
      const service = await buildService(false);
      await expect(service.findAll()).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('create throws ServiceUnavailable', async () => {
      const service = await buildService(false);
      await expect(
        service.create({ slug: 'ON', name: 'Olancho Net' }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('when MULTI_TENANT_ENABLED is true', () => {
    it('findAll throws NotImplemented (Phase 1 will add Organization model)', async () => {
      const service = await buildService(true);
      await expect(service.findAll()).rejects.toBeInstanceOf(NotImplementedException);
    });

    it('create throws NotImplemented (Phase 1 will add Organization model)', async () => {
      const service = await buildService(true);
      await expect(
        service.create({ slug: 'ON', name: 'Olancho Net' }),
      ).rejects.toBeInstanceOf(NotImplementedException);
    });

    it('findBySlug throws NotImplemented', async () => {
      const service = await buildService(true);
      await expect(service.findBySlug('ON')).rejects.toBeInstanceOf(NotImplementedException);
    });
  });
});
