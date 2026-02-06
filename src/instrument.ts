import * as Sentry from '@sentry/nestjs';

let nodeProfilingIntegration: (() => any) | undefined;
try {
  nodeProfilingIntegration = require('@sentry/profiling-node').nodeProfilingIntegration;
} catch {
  console.log('Sentry profiling not available - skipping profiling integration');
}

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

    // Profiling (only in production to reduce overhead)
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,

    integrations: [
      ...(nodeProfilingIntegration ? [nodeProfilingIntegration()] : []),
    ],

    // Filter out sensitive data
    beforeSend(event) {
      // Remove sensitive headers
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
      }

      // Remove sensitive data from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
          if (breadcrumb.data?.password) {
            breadcrumb.data.password = '[REDACTED]';
          }
          return breadcrumb;
        });
      }

      return event;
    },
  });

  console.log('Sentry initialized successfully');
} else {
  console.log('Sentry DSN not configured - error tracking disabled');
}
