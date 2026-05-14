import { ForbiddenException, CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { TenantContextInterceptor } from './tenant-context.interceptor';
import { TenantContextService } from './tenant-context.service';
import { TenantFlagService } from './tenant-flag.service';

describe('TenantContextInterceptor', () => {
  let interceptor: TenantContextInterceptor;
  let ctx: jest.Mocked<TenantContextService>;
  let flag: jest.Mocked<TenantFlagService>;
  let next: CallHandler;

  beforeEach(() => {
    ctx = {
      setContext: jest.fn(),
    } as unknown as jest.Mocked<TenantContextService>;
    flag = {
      isEnabled: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<TenantFlagService>;
    next = { handle: jest.fn().mockReturnValue(of('ok')) };
    interceptor = new TenantContextInterceptor(ctx, flag);
  });

  const buildExecutionContext = (request: unknown): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  it('flag disabled: short-circuits, does not touch context', () => {
    flag.isEnabled.mockReturnValue(false);
    const ec = buildExecutionContext({ user: { userId: 'u1' } });

    interceptor.intercept(ec, next);

    expect(ctx.setContext).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalled();
  });

  it('public route (no user): does not touch context', () => {
    const ec = buildExecutionContext({});

    interceptor.intercept(ec, next);

    expect(ctx.setContext).not.toHaveBeenCalled();
    expect(next.handle).toHaveBeenCalled();
  });

  it('normal user with orgId: sets full context', () => {
    const ec = buildExecutionContext({
      user: {
        userId: 'u1',
        email: 'jane@olanchnet.com',
        role: 'USER',
        orgId: 'org_on',
        orgRole: 'MEMBER',
      },
      headers: {},
    });

    interceptor.intercept(ec, next);

    expect(ctx.setContext).toHaveBeenCalledWith({
      userId: 'u1',
      userRole: 'USER',
      orgId: 'org_on',
      orgRole: 'MEMBER',
    });
  });

  it('normal user without orgId (multi-org pending switch): sets partial context', () => {
    const ec = buildExecutionContext({
      user: { userId: 'u1', email: 'pedro@gmail.com', role: 'USER' },
      headers: {},
    });

    interceptor.intercept(ec, next);

    expect(ctx.setContext).toHaveBeenCalledWith({
      userId: 'u1',
      userRole: 'USER',
      orgId: undefined,
      orgRole: undefined,
    });
  });

  it('SUPER_ADMIN with X-Org-Id: impersonates target org as ORG_ADMIN', () => {
    const ec = buildExecutionContext({
      user: { userId: 'admin1', email: 'super@obsid.app', role: 'SUPER_ADMIN' },
      headers: { 'x-org-id': 'org_acme' },
      method: 'GET',
      url: '/inventory',
    });

    interceptor.intercept(ec, next);

    expect(ctx.setContext).toHaveBeenCalledWith({
      userId: 'admin1',
      userRole: 'SUPER_ADMIN',
      orgId: 'org_acme',
      orgRole: 'ORG_ADMIN',
    });
  });

  it('SUPER_ADMIN without X-Org-Id: only sets identity, no org binding', () => {
    const ec = buildExecutionContext({
      user: { userId: 'admin1', email: 'super@obsid.app', role: 'SUPER_ADMIN' },
      headers: {},
    });

    interceptor.intercept(ec, next);

    expect(ctx.setContext).toHaveBeenCalledWith({
      userId: 'admin1',
      userRole: 'SUPER_ADMIN',
    });
  });

  it('non-SUPER_ADMIN sending X-Org-Id: throws Forbidden', () => {
    const ec = buildExecutionContext({
      user: { userId: 'u1', email: 'jane@x.com', role: 'USER', orgId: 'org_on', orgRole: 'MEMBER' },
      headers: { 'x-org-id': 'org_acme' },
    });

    expect(() => interceptor.intercept(ec, next)).toThrow(ForbiddenException);
    expect(ctx.setContext).not.toHaveBeenCalled();
  });

  it('handles X-Org-Id as array (multiple headers): uses first value', () => {
    const ec = buildExecutionContext({
      user: { userId: 'admin1', email: 'super@obsid.app', role: 'SUPER_ADMIN' },
      headers: { 'x-org-id': ['org_acme', 'org_extra'] },
      method: 'GET',
      url: '/x',
    });

    interceptor.intercept(ec, next);

    expect(ctx.setContext).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: 'org_acme' }),
    );
  });

  it('treats empty/whitespace X-Org-Id as absent', () => {
    const ec = buildExecutionContext({
      user: { userId: 'admin1', email: 'super@obsid.app', role: 'SUPER_ADMIN' },
      headers: { 'x-org-id': '   ' },
    });

    interceptor.intercept(ec, next);

    expect(ctx.setContext).toHaveBeenCalledWith({
      userId: 'admin1',
      userRole: 'SUPER_ADMIN',
    });
  });
});
