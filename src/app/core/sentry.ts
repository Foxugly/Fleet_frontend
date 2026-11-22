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
    sendDefaultPii: false,
    beforeSend: (event) => scrubEvent(event),
    beforeBreadcrumb: (breadcrumb) => scrubBreadcrumb(breadcrumb),
  });
  return true;
}
