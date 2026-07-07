import * as Sentry from '@sentry/node';

/**
 * No-ops when SENTRY_DSN isn't set (default for local/dev). Must run before
 * the Nest app is created so Sentry's instrumentation can hook in early.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1,
  });
}
