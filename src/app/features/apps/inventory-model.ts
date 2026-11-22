import { HttpErrorResponse } from '@angular/common/http';

/**
 * Client mirror of the server's `apps/inventory/validation.py` (`clean_app`): the
 * cheap checks run before the code is asked, the server stays authoritative.
 * Keep the regexes and caps in sync with the backend.
 */
export const REPO_RE = /^Foxugly\/[A-Za-z0-9_.-]+$/;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
export const VHOST_RE = /^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/;
export const LOCK_PATH_RE = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/;
export const HEALTH_PATH_RE = /^\/[A-Za-z0-9._~/-]*$/;
export const SENTRY_RE = /^[a-z0-9][a-z0-9_-]{0,99}$/;
export const SLUG_MAX = 64;
export const STRING_MAX = 200;
export const LIST_MAX = 50;

export const LIST_FIELDS = ['repos', 'vhosts', 'sentry_projects', 'python_locks', 'npm_locks'] as const;
export type ListField = (typeof LIST_FIELDS)[number];

/** The editable fields, in form order. */
export const FIELD_ORDER = [
  'slug',
  'repos',
  'vhosts',
  'health_path',
  'sentry_projects',
  'python_locks',
  'npm_locks',
  'deployed',
  'actions_allowed',
] as const;
export type FieldKey = (typeof FIELD_ORDER)[number];

export interface AppFields {
  slug: string;
  repos: string[];
  vhosts: string[];
  health_path: string;
  sentry_projects: string[];
  python_locks: string[];
  npm_locks: string[];
  deployed: boolean;
  actions_allowed: boolean;
}

/** A Transloco key plus its params (values come from the user: interpolation only). */
export interface FieldError {
  key: string;
  params?: Record<string, unknown>;
}

export type FieldErrors = Partial<Record<FieldKey, FieldError[]>>;

export function emptyApp(): AppFields {
  return {
    slug: '',
    repos: [],
    vhosts: [],
    health_path: '/health/',
    sentry_projects: [],
    python_locks: [],
    npm_locks: [],
    deployed: true,
    actions_allowed: false,
  };
}

function badLockPath(path: string): boolean {
  return !LOCK_PATH_RE.test(path) || path.split('/').some((p) => p === '' || p === '.' || p === '..');
}

/** Per-field errors (an empty object when valid). */
export function validateApp(v: AppFields): FieldErrors {
  const errors: FieldErrors = {};
  const add = (field: FieldKey, error: FieldError) => (errors[field] ??= []).push(error);

  if (!SLUG_RE.test(v.slug) || v.slug.length > SLUG_MAX) add('slug', { key: 'apps.invalid.slug' });

  const sized = new Set<ListField>();
  for (const field of LIST_FIELDS) {
    if (v[field].length > LIST_MAX) add(field, { key: 'apps.invalid.too_many', params: { max: LIST_MAX } });
    else if (v[field].some((s) => s.length > STRING_MAX)) add(field, { key: 'apps.invalid.too_long', params: { max: STRING_MAX } });
    else sized.add(field);
  }
  const each = (field: ListField, check: (value: string) => FieldError | null) => {
    if (!sized.has(field)) return;
    for (const value of v[field]) {
      const error = check(value);
      if (error) add(field, error);
    }
  };
  each('repos', (value) => (REPO_RE.test(value) ? null : { key: 'apps.invalid.repo', params: { value } }));
  each('vhosts', (value) => (VHOST_RE.test(value) ? null : { key: 'apps.invalid.vhost', params: { value } }));
  each('sentry_projects', (value) => (SENTRY_RE.test(value) ? null : { key: 'apps.invalid.sentry', params: { value } }));
  for (const field of ['python_locks', 'npm_locks'] as const) {
    each(field, (value) => {
      const at = value.indexOf(':');
      if (at < 0 || badLockPath(value.slice(at + 1))) return { key: 'apps.invalid.lock_format', params: { value } };
      const repo = value.slice(0, at);
      return v.repos.includes(repo) ? null : { key: 'apps.invalid.lock_repo', params: { value, repo } };
    });
  }

  const hp = v.health_path;
  if (!HEALTH_PATH_RE.test(hp) || hp.length > STRING_MAX || hp.split('/').some((p) => p === '.' || p === '..')) {
    add('health_path', { key: 'apps.invalid.health_path' });
  }
  return errors;
}

/** How a failed write is shown. */
export type WriteFailure =
  /** Stay in (or reopen) the code dialog with this message: the form data is kept. */
  | { kind: 'totp'; key: string }
  /** Server validation (400): close the dialog, show each message under its field. */
  | { kind: 'fields'; errors: Record<string, string[]> };

function fieldErrors(body: unknown): Record<string, string[]> | null {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return null;
  const out: Record<string, string[]> = {};
  for (const [field, value] of Object.entries(body as Record<string, unknown>)) {
    const messages = typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((m): m is string => typeof m === 'string') : [];
    if (messages.length) out[field] = messages;
  }
  return Object.keys(out).length ? out : null;
}

export function writeFailure(err: unknown): WriteFailure {
  const status = err instanceof HttpErrorResponse ? err.status : 0;
  if (status === 400) {
    const errors = fieldErrors((err as HttpErrorResponse).error);
    if (errors) return { kind: 'fields', errors };
  }
  if (status === 403 && (err as HttpErrorResponse).error?.code === 'totp_invalid') return { kind: 'totp', key: 'apps.totp.invalid' };
  if (status === 429) return { kind: 'totp', key: 'apps.error.too_many' };
  if (status === 404) return { kind: 'totp', key: 'apps.error.not_found' };
  return { kind: 'totp', key: 'apps.error.unavailable' };
}

export interface ChangeRow {
  field: string;
  before: unknown;
  after: unknown;
}

const HISTORY_ORDER: readonly string[] = [...FIELD_ORDER, 'archived'];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** The fields whose value differs between `before` and `after` (all of `after` for a creation). */
export function changedFields(before: unknown, after: unknown): ChangeRow[] {
  const b = asRecord(before);
  const a = asRecord(after);
  const keys = new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})]);
  const ordered = [...HISTORY_ORDER.filter((k) => keys.has(k)), ...[...keys].filter((k) => !HISTORY_ORDER.includes(k)).sort()];
  return ordered
    .filter((k) => JSON.stringify(b?.[k]) !== JSON.stringify(a?.[k]))
    .map((field) => ({ field, before: b?.[field], after: a?.[field] }));
}

/** Display form of a history value: a Transloco key, or text to interpolate. */
export function formatValue(v: unknown): { key: string } | { text: string } {
  if (v === undefined || v === null) return { key: 'apps.history.none' };
  if (typeof v === 'boolean') return { key: v ? 'apps.history.yes' : 'apps.history.no' };
  if (Array.isArray(v)) return v.length ? { text: v.map(String).join(', ') } : { key: 'apps.history.empty' };
  if (typeof v === 'object') return { text: JSON.stringify(v) };
  return { text: String(v) };
}

/** Label key of a history field, or null for a field the client does not know. */
export function fieldLabelKey(field: string): string | null {
  return HISTORY_ORDER.includes(field) ? `apps.field.${field}` : null;
}
