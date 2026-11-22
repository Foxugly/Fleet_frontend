import { describe, expect, it } from 'vitest';
import type { Event } from '@sentry/angular';

import { FILTERED, scrubBreadcrumb, scrubEvent, scrubUrl } from './sentry-scrub';

describe('scrubUrl', () => {
  it.each([
    ['/x?code=123456', `/x?code=${FILTERED}`],
    ['/x?mfa_token=abc&a=1', `/x?mfa_token=${FILTERED}&a=1`],
    ['/login?returnUrl=%2Fsite%2F1', `/login?returnUrl=${FILTERED}`],
    ['/x?access=a&refresh=r&password=p', `/x?access=${FILTERED}&refresh=${FILTERED}&password=${FILTERED}`],
  ])('%s', (input, expected) => {
    expect(scrubUrl(input)).toBe(expected);
  });

  it('leaves clean URLs alone', () => {
    expect(scrubUrl('/api/v1/sites/')).toBe('/api/v1/sites/');
    expect(scrubUrl(undefined)).toBeUndefined();
  });
});

describe('scrubEvent', () => {
  it.each(['mfa_token', 'code', 'totp_code', 'totpCode', 'password', 'refresh', 'access', 'recovery_codes', 'secret'])(
    'masks %s in the request body, extra and breadcrumb data',
    (key) => {
      const event = {
        request: { data: { [key]: 'SECRET', keep: 'ok', nested: { [key]: 'SECRET' } } },
        extra: { [key]: 'SECRET' },
        breadcrumbs: [{ category: 'fetch', data: { [key]: 'SECRET', url: '/a' } }],
      } as unknown as Event;
      const out = JSON.stringify(scrubEvent(event));
      expect(out).not.toContain('SECRET');
      expect(out).toContain('"keep":"ok"');
    },
  );

  it('masks a JSON string body', () => {
    const event = { request: { data: '{"password":"hunter2","code":"123456"}' } } as unknown as Event;
    expect(JSON.stringify(scrubEvent(event))).not.toMatch(/hunter2|123456/);
  });

  it('drops the Authorization header, cookies and the Cookie header', () => {
    const event = {
      request: {
        headers: { Authorization: 'Bearer SECRET', authorization: 'Bearer SECRET', Cookie: 'refresh=SECRET', Accept: 'x' },
        cookies: { refresh: 'SECRET' },
      },
    } as unknown as Event;
    const out = scrubEvent(event);
    expect(JSON.stringify(out)).not.toContain('SECRET');
    expect(out.request?.headers?.['Accept']).toBe('x');
    expect(out.request?.cookies).toBeUndefined();
  });

  it('masks exception and message text carrying a token in a URL', () => {
    const event = {
      message: 'GET /x?code=999',
      exception: { values: [{ value: 'failed /y?mfa_token=abc' }] },
    } as unknown as Event;
    const out = JSON.stringify(scrubEvent(event));
    expect(out).not.toMatch(/999|abc/);
  });
});

describe('scrubBreadcrumb', () => {
  it('masks data keys and URLs', () => {
    const b = scrubBreadcrumb({ message: 'GET /x?code=1', data: { url: '/x?token=t', refresh: 'R' } });
    expect(JSON.stringify(b)).not.toMatch(/"R"|=1|=t/);
  });
});
