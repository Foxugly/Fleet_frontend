/**
 * Strips credentials from Sentry events. Fleet is a single-operator dashboard behind
 * password + TOTP, so nothing below may ever reach Sentry: the access token (memory
 * only), the refresh token (cookie), `mfa_token`, the TOTP `code` (and the inventory step-up `totp_code`), the `password`,
 * the `recovery_codes` and the TOTP `secret` / `otpauth_uri`. Applied to request
 * bodies (object or JSON string), headers, cookies, breadcrumbs, extra, contexts,
 * and to URLs in messages (query parameters).
 */
import type { Breadcrumb, Event } from '@sentry/angular';

export const FILTERED = '[Filtered]';

const SENSITIVE_KEYS = new Set([
  'access',
  'refresh',
  'access_token',
  'refresh_token',
  'token',
  'mfa_token',
  'mfatoken',
  'code',
  'totp_code',
  'totpcode',
  'password',
  'recovery_codes',
  'recoverycodes',
  'secret',
  'otpauth_uri',
  'otpauthuri',
  'qr_svg',
  'qrsvg',
  'authorization',
  'cookie',
  'set-cookie',
]);

const SENSITIVE_QUERY =
  /([?&](?:access|refresh|access_token|refresh_token|token|mfa_token|code|totp_code|password|returnUrl)=)[^&#\s"']*/gi;

/** Masks sensitive query parameters in a string containing a URL. */
export function scrubUrl(value: string): string;
export function scrubUrl(value: string | undefined): string | undefined;
export function scrubUrl(value: string | undefined): string | undefined {
  if (!value) return value;
  return value.replace(SENSITIVE_QUERY, (_m, prefix: string) => `${prefix}${FILTERED}`);
}

/** Deep copy with every sensitive key masked; JSON strings are parsed, scrubbed, re-serialised. */
export function scrubData(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (typeof value === 'string') {
    const t = value.trim();
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        return JSON.stringify(scrubData(JSON.parse(t), depth + 1));
      } catch {
        /* not JSON: fall through */
      }
    }
    return scrubUrl(value);
  }
  if (Array.isArray(value)) return value.map((v) => scrubData(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? FILTERED : scrubData(v, depth + 1);
    }
    return out;
  }
  return value;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.data) breadcrumb.data = scrubData(breadcrumb.data) as Record<string, unknown>;
  if (breadcrumb.message) breadcrumb.message = scrubUrl(breadcrumb.message);
  return breadcrumb;
}

export function scrubEvent<T extends Event>(event: T): T {
  const req = event.request;
  if (req) {
    req.url = scrubUrl(req.url);
    if (typeof req.query_string === 'string') req.query_string = scrubUrl(`?${req.query_string}`).slice(1);
    if (req.data !== undefined) req.data = scrubData(req.data);
    if (req.headers) req.headers = scrubData(req.headers) as Record<string, string>;
    delete req.cookies;
  }
  if (event.extra) event.extra = scrubData(event.extra) as Record<string, unknown>;
  if (event.contexts) event.contexts = scrubData(event.contexts) as typeof event.contexts;
  if (event.transaction) event.transaction = scrubUrl(event.transaction);
  event.breadcrumbs?.forEach(scrubBreadcrumb);
  for (const span of event.spans ?? []) {
    if (span.description) span.description = scrubUrl(span.description);
    if (span.data) span.data = scrubData(span.data) as typeof span.data;
  }
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = scrubUrl(ex.value);
  }
  if (event.message) event.message = scrubUrl(event.message);
  return event;
}
