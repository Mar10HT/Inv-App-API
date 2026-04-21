import { ClsService } from 'nestjs-cls';

export const TENANT_BYPASS_KEY = 'tenant.bypass';

/**
 * Runs `fn` inside a CLS context where tenant scoping is bypassed.
 * Intended for trusted paths only: seeds, migrations, cron jobs, SUPER_ADMIN actions.
 */
export function runWithTenantBypass<T>(cls: ClsService, fn: () => T | Promise<T>): Promise<T> {
  return cls.run(async () => {
    cls.set(TENANT_BYPASS_KEY, true);
    return fn();
  });
}

export function isTenantBypass(cls: ClsService): boolean {
  if (!cls.isActive()) return false;
  return cls.get<boolean>(TENANT_BYPASS_KEY) === true;
}
