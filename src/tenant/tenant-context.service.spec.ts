import { ClsModule, ClsService } from 'nestjs-cls';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  let cls: ClsService;
  let ctx: TenantContextService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ClsModule.forRoot()],
      providers: [TenantContextService],
    }).compile();

    cls = module.get(ClsService);
    ctx = module.get(TenantContextService);
  });

  describe('outside an active CLS scope', () => {
    it('all accessors return undefined', () => {
      expect(ctx.getOrgId()).toBeUndefined();
      expect(ctx.getUserId()).toBeUndefined();
      expect(ctx.getUserRole()).toBeUndefined();
      expect(ctx.getOrgRole()).toBeUndefined();
      expect(ctx.hasOrgContext()).toBe(false);
      expect(ctx.isSuperAdmin()).toBe(false);
      expect(ctx.bypassesWarehouseFilter()).toBe(false);
    });

    it('setContext silently no-ops (no throw)', () => {
      expect(() => ctx.setContext({ orgId: 'org_on' })).not.toThrow();
    });
  });

  describe('inside an active CLS scope', () => {
    it('setContext persists for the duration of the scope', async () => {
      await cls.run(async () => {
        ctx.setContext({
          orgId: 'org_on',
          userId: 'u1',
          userRole: 'USER',
          orgRole: 'MEMBER',
        });

        expect(ctx.getOrgId()).toBe('org_on');
        expect(ctx.getUserId()).toBe('u1');
        expect(ctx.getUserRole()).toBe('USER');
        expect(ctx.getOrgRole()).toBe('MEMBER');
        expect(ctx.snapshot()).toEqual({
          orgId: 'org_on',
          userId: 'u1',
          userRole: 'USER',
          orgRole: 'MEMBER',
        });
      });
    });

    it('context does NOT leak between independent scopes', async () => {
      const scope1Result = await cls.run(async () => {
        ctx.setContext({ orgId: 'org_a' });
        return ctx.getOrgId();
      });

      const scope2Result = await cls.run(async () => {
        return ctx.getOrgId();
      });

      expect(scope1Result).toBe('org_a');
      expect(scope2Result).toBeUndefined();
    });

    it('hasOrgContext reflects orgId presence', async () => {
      await cls.run(async () => {
        expect(ctx.hasOrgContext()).toBe(false);
        ctx.setContext({ orgId: 'org_on' });
        expect(ctx.hasOrgContext()).toBe(true);
      });
    });

    it('isSuperAdmin returns true only when userRole equals SUPER_ADMIN', async () => {
      await cls.run(async () => {
        ctx.setContext({ userRole: 'USER' });
        expect(ctx.isSuperAdmin()).toBe(false);
        ctx.setContext({ userRole: 'SUPER_ADMIN' });
        expect(ctx.isSuperAdmin()).toBe(true);
      });
    });

    it('bypassesWarehouseFilter only for OWNER or ORG_ADMIN', async () => {
      await cls.run(async () => {
        ctx.setContext({ orgRole: 'MEMBER' });
        expect(ctx.bypassesWarehouseFilter()).toBe(false);

        ctx.setContext({ orgRole: 'EXTERNAL' });
        expect(ctx.bypassesWarehouseFilter()).toBe(false);

        ctx.setContext({ orgRole: 'OWNER' });
        expect(ctx.bypassesWarehouseFilter()).toBe(true);

        ctx.setContext({ orgRole: 'ORG_ADMIN' });
        expect(ctx.bypassesWarehouseFilter()).toBe(true);
      });
    });

    it('partial setContext only updates provided fields', async () => {
      await cls.run(async () => {
        ctx.setContext({ orgId: 'org_a', userId: 'u1' });
        ctx.setContext({ userId: 'u2' });

        expect(ctx.getOrgId()).toBe('org_a'); // preserved
        expect(ctx.getUserId()).toBe('u2');   // updated
      });
    });
  });
});
