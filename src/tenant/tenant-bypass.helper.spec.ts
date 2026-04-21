import { ClsModule, ClsService } from 'nestjs-cls';
import { Test, TestingModule } from '@nestjs/testing';
import { isTenantBypass, runWithTenantBypass, TENANT_BYPASS_KEY } from './tenant-bypass.helper';

describe('tenant-bypass helper', () => {
  let cls: ClsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ClsModule.forRoot()],
    }).compile();
    await module.init();

    cls = module.get(ClsService);
  });

  it('TENANT_BYPASS_KEY is stable so callers can reuse it', () => {
    expect(TENANT_BYPASS_KEY).toBe('tenant.bypass');
  });

  it('sets bypass flag inside the callback and returns its value', async () => {
    const result = await runWithTenantBypass(cls, () => {
      expect(isTenantBypass(cls)).toBe(true);
      return 42;
    });
    expect(result).toBe(42);
  });

  it('works with async callbacks', async () => {
    const result = await runWithTenantBypass(cls, async () => {
      await Promise.resolve();
      expect(isTenantBypass(cls)).toBe(true);
      return 'ok';
    });
    expect(result).toBe('ok');
  });

  it('does not leak bypass flag outside the callback', async () => {
    await runWithTenantBypass(cls, () => undefined);
    // Outside a CLS.run context, isTenantBypass should be false.
    expect(isTenantBypass(cls)).toBe(false);
  });

  it('propagates rejection from async callbacks', async () => {
    await expect(
      runWithTenantBypass(cls, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('isTenantBypass returns false when no CLS context is active', () => {
    expect(isTenantBypass(cls)).toBe(false);
  });
});
