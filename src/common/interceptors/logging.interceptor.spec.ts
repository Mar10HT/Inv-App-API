import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockLogger: { log: jest.Mock; error: jest.Mock };

  const buildContext = (overrides: Partial<{ method: string; url: string; body: any; user: any }> = {}) => {
    const req = {
      method: overrides.method ?? 'GET',
      url: overrides.url ?? '/test',
      body: overrides.body ?? {},
      query: {},
      params: {},
      ip: '127.0.0.1',
      connection: { remoteAddress: '127.0.0.1' },
      user: overrides.user ?? undefined,
      get: jest.fn().mockReturnValue('jest-agent'),
    };

    const res = { statusCode: 200 };

    return {
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => res,
      }),
    } as any;
  };

  beforeEach(() => {
    mockLogger = { log: jest.fn(), error: jest.fn() };
    interceptor = new LoggingInterceptor(mockLogger as any);
  });

  it('logs GET request on success', (done) => {
    const ctx = buildContext({ method: 'GET', url: '/items' });
    const next = { handle: () => of({ data: [] }) };

    interceptor.intercept(ctx, next).subscribe({
      complete: () => {
        expect(mockLogger.log).toHaveBeenCalledWith(
          expect.stringContaining('GET /items'),
          'HTTP',
        );
        done();
      },
    });
  });

  it('logs POST request with sanitized body', (done) => {
    const ctx = buildContext({
      method: 'POST',
      url: '/auth/login',
      body: { email: 'test@test.com', password: 'secret123' },
    });
    const next = { handle: () => of({ token: 'jwt' }) };

    interceptor.intercept(ctx, next).subscribe({
      complete: () => {
        const logCall = mockLogger.log.mock.calls[0][0];
        expect(logCall).not.toContain('secret123');
        expect(logCall).toContain('[REDACTED]');
        done();
      },
    });
  });

  it('logs error on failed request', (done) => {
    const ctx = buildContext({ method: 'POST', url: '/inventory' });
    const error = Object.assign(new Error('Not found'), { status: 404 });
    const next = { handle: () => throwError(() => error) };

    interceptor.intercept(ctx, next).subscribe({
      error: () => {
        expect(mockLogger.error).toHaveBeenCalledWith(
          expect.stringContaining('404'),
          error.stack,
          'HTTP',
        );
        done();
      },
    });
  });

  it('uses anonymous when no user on request', (done) => {
    const ctx = buildContext({ method: 'GET', url: '/public' });
    const next = { handle: () => of({}) };

    interceptor.intercept(ctx, next).subscribe({
      complete: () => {
        expect(mockLogger.log).toHaveBeenCalledWith(
          expect.stringContaining('anonymous'),
          'HTTP',
        );
        done();
      },
    });
  });

  it('sanitizes newPassword and token fields', (done) => {
    const ctx = buildContext({
      method: 'POST',
      url: '/auth/change-password',
      body: { currentPassword: 'old', newPassword: 'new', token: 'abc123' },
    });
    const next = { handle: () => of({}) };

    interceptor.intercept(ctx, next).subscribe({
      complete: () => {
        const logCall = mockLogger.log.mock.calls[0][0];
        expect(logCall).not.toContain('old');
        expect(logCall).not.toContain('abc123');
        done();
      },
    });
  });
});
