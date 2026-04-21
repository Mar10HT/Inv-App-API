import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TenantFlagService } from './tenant-flag.service';

describe('TenantFlagService', () => {
  const buildService = async (envValue: unknown): Promise<TenantFlagService> => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantFlagService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => (key === 'MULTI_TENANT_ENABLED' ? envValue : undefined),
          },
        },
      ],
    }).compile();

    return module.get<TenantFlagService>(TenantFlagService);
  };

  it('returns true when MULTI_TENANT_ENABLED is boolean true', async () => {
    const service = await buildService(true);
    expect(service.isEnabled()).toBe(true);
  });

  it('returns false when MULTI_TENANT_ENABLED is boolean false', async () => {
    const service = await buildService(false);
    expect(service.isEnabled()).toBe(false);
  });

  it('returns true when MULTI_TENANT_ENABLED is the string "true"', async () => {
    const service = await buildService('true');
    expect(service.isEnabled()).toBe(true);
  });

  it('returns false when MULTI_TENANT_ENABLED is the string "false"', async () => {
    const service = await buildService('false');
    expect(service.isEnabled()).toBe(false);
  });

  it('returns false when MULTI_TENANT_ENABLED is undefined', async () => {
    const service = await buildService(undefined);
    expect(service.isEnabled()).toBe(false);
  });

  it('returns false for any other string value', async () => {
    const service = await buildService('yes');
    expect(service.isEnabled()).toBe(false);
  });

  it('assertEnabled() throws when disabled', async () => {
    const service = await buildService(false);
    expect(() => service.assertEnabled()).toThrow(/multi-tenant/i);
  });

  it('assertEnabled() does not throw when enabled', async () => {
    const service = await buildService(true);
    expect(() => service.assertEnabled()).not.toThrow();
  });
});
