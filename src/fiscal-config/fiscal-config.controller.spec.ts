import { FiscalConfigController } from './fiscal-config.controller';
import { PERMISSIONS_KEY } from '../auth/decorators';

describe('FiscalConfigController permissions', () => {
  it('allows reports-only users to read the fiscal config', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const perms = Reflect.getMetadata(
      PERMISSIONS_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      FiscalConfigController.prototype.get,
    );

    expect(perms).toEqual(
      expect.arrayContaining([
        'settings:view',
        'sales:create',
        'purchases:create',
        'reports:view',
        'reports:export',
      ]),
    );
  });

  it('keeps update restricted to settings:edit', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const perms = Reflect.getMetadata(
      PERMISSIONS_KEY,
      // eslint-disable-next-line @typescript-eslint/unbound-method
      FiscalConfigController.prototype.update,
    );

    expect(perms).toEqual(['settings:edit']);
  });
});
