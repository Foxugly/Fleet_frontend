import { HttpErrorResponse } from '@angular/common/http';

import { AppFields, changedFields, emptyApp, formatValue, validateApp, writeFailure } from './inventory-model';

const valid = (extra: Partial<AppFields> = {}): AppFields => ({
  ...emptyApp(),
  slug: 'poker',
  repos: ['Foxugly/Poker_server'],
  vhosts: ['poker.foxugly.com'],
  sentry_projects: ['poker-backend'],
  python_locks: ['Foxugly/Poker_server:requirements.txt'],
  npm_locks: [],
  ...extra,
});

const keys = (v: AppFields, field: keyof AppFields) => (validateApp(v)[field] ?? []).map((e) => e.key);

describe('validateApp (client mirror of clean_app)', () => {
  it('accepts a valid app', () => {
    expect(validateApp(valid())).toEqual({});
  });

  it.each(['', 'Poker', '-poker', 'po ker', 'a'.repeat(65)])('rejects slug %j', (slug) => {
    expect(keys(valid({ slug }), 'slug')).toEqual(['apps.invalid.slug']);
  });

  it('rejects a repo outside Owner/Repo for Foxugly', () => {
    expect(keys(valid({ repos: ['Poker_server'] }), 'repos')).toContain('apps.invalid.repo');
    expect(keys(valid({ repos: ['Other/Poker'] }), 'repos')).toContain('apps.invalid.repo');
  });

  it('rejects a bad vhost and a bad Sentry project', () => {
    expect(keys(valid({ vhosts: ['poker..com-'] }), 'vhosts')).toEqual(['apps.invalid.vhost']);
    expect(keys(valid({ sentry_projects: ['Poker Backend'] }), 'sentry_projects')).toEqual(['apps.invalid.sentry']);
  });

  it('flags a lock whose repo is not among the repos', () => {
    const errors = validateApp(valid({ npm_locks: ['Foxugly/Poker_frontend:package-lock.json'] }));
    expect(errors.npm_locks).toEqual([
      { key: 'apps.invalid.lock_repo', params: { value: 'Foxugly/Poker_frontend:package-lock.json', repo: 'Foxugly/Poker_frontend' } },
    ]);
  });

  it.each(['requirements.txt', 'Foxugly/Poker_server:', 'Foxugly/Poker_server:../etc', 'Foxugly/Poker_server:a//b', 'Foxugly/Poker_server:/abs'])(
    'flags lock %j as badly formed',
    (lock) => {
      expect(keys(valid({ python_locks: [lock] }), 'python_locks')).toEqual(['apps.invalid.lock_format']);
    },
  );

  it.each(['health/', '/a/../b', '/x y'])('rejects health_path %j', (health_path) => {
    expect(keys(valid({ health_path }), 'health_path')).toEqual(['apps.invalid.health_path']);
  });

  it('caps lists at 50 entries and strings at 200 characters', () => {
    const many = Array.from({ length: 51 }, (_, i) => `h${i}.foxugly.com`);
    expect(keys(valid({ vhosts: many }), 'vhosts')).toEqual(['apps.invalid.too_many']);
    expect(keys(valid({ vhosts: ['a'.repeat(201)] }), 'vhosts')).toEqual(['apps.invalid.too_long']);
  });
});

const httpError = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

describe('writeFailure', () => {
  it('403 totp_invalid keeps the code dialog with the invalid-code message', () => {
    expect(writeFailure(httpError(403, { code: 'totp_invalid' }))).toEqual({ kind: 'totp', key: 'apps.totp.invalid' });
  });

  it('429 and network errors stay in the code dialog too', () => {
    expect(writeFailure(httpError(429))).toEqual({ kind: 'totp', key: 'apps.error.too_many' });
    expect(writeFailure(httpError(0))).toEqual({ kind: 'totp', key: 'apps.error.unavailable' });
    expect(writeFailure(httpError(502))).toEqual({ kind: 'totp', key: 'apps.error.unavailable' });
  });

  it('400 maps the field errors (strings or lists), dropping anything else', () => {
    const failure = writeFailure(httpError(400, { slug: ['This slug already exists.'], detail: 'Bad.', npm_locks: [1, 'Invalid lock.'], x: { y: 1 } }));
    expect(failure).toEqual({ kind: 'fields', errors: { slug: ['This slug already exists.'], detail: ['Bad.'], npm_locks: ['Invalid lock.'] } });
  });

  it('a 400 without a usable body falls back to a generic message', () => {
    expect(writeFailure(httpError(400, 'oops'))).toEqual({ kind: 'totp', key: 'apps.error.unavailable' });
  });
});

describe('changedFields / formatValue', () => {
  it('keeps only the changed fields, in form order, archived included', () => {
    const before = { ...valid(), archived: false };
    const after = { ...valid({ vhosts: ['new.foxugly.com'] }), archived: true };
    expect(changedFields(before, after).map((r) => r.field)).toEqual(['vhosts', 'archived']);
  });

  it('a creation (before null) lists every field of after', () => {
    const rows = changedFields(null, { ...valid(), archived: false });
    expect(rows.map((r) => r.field)).toContain('slug');
    expect(rows.find((r) => r.field === 'slug')!.before).toBeUndefined();
  });

  it('formats lists, booleans and missing values', () => {
    expect(formatValue(['a', 'b'])).toEqual({ text: 'a, b' });
    expect(formatValue([])).toEqual({ key: 'apps.history.empty' });
    expect(formatValue(true)).toEqual({ key: 'apps.history.yes' });
    expect(formatValue(undefined)).toEqual({ key: 'apps.history.none' });
    expect(formatValue('/health/')).toEqual({ text: '/health/' });
  });
});
