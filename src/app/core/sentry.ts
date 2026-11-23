import * as Sentry from '@sentry/angular';

import type { FleetRuntimeConfig } from './runtime-config';
import { scrubBreadcrumb, scrubEvent } from './sentry-scrub';

/**
 * Enables Sentry only when a DSN is injected (prod, via window.__FLEET__.sentry);
 * a no-op otherwise (dev, or a vhost without Sentry). Error reporting only: no
 * tracing (it would add sentry-trace/baggage headers to the cross-origin API calls).
 * Returns whether Sentry was initialised.
 */
export function initSentry(cfg: FleetRuntimeConfig['sentry']): boolean {
  if (!cfg?.dsn) return false;
  Sentry.init({
    dsn: cfg.dsn,
    environment: cfg.environment || undefined,
    release: cfg.release || undefined,
    // Sentry 11 replaced `sendDefaultPii` with `dataCollection`, whose defaults are
    // more permissive: pin the restrictive v10 baseline explicitly.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: {
        request: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
        response: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      },
      httpBodies: [],
      urlQueryParams: { deny: ['forwarded', '-ip', 'remote-', 'via', '-user'] },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      graphQL: { document: false, variables: false },
    },
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
  return true;
}
