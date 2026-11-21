import { HttpErrorResponse } from '@angular/common/http';

import { loginErrorKey, mfaFailure, safeReturnUrl } from './auth-flow';

const http = (status: number, error: unknown = null) => new HttpErrorResponse({ status, error });

describe('safeReturnUrl', () => {
  it.each([
    ['/sites/quizonline', '/sites/quizonline'],
    ['/box?x=1', '/box?x=1'],
    ['/', '/'],
  ])('keeps the internal path %s', (input, expected) => expect(safeReturnUrl(input)).toBe(expected));

  it.each([
    '//evil.example',
    'https://evil.example',
    'http://evil.example/x',
    '/\\evil.example',
    '\\\\evil.example',
    'javascript:alert(1)',
    '',
    null,
    undefined,
    'sites',
  ])('falls back to / for %s', (input) => expect(safeReturnUrl(input)).toBe('/'));
});

describe('loginErrorKey', () => {
  it('maps a DRF 400 to invalid credentials', () =>
    expect(loginErrorKey(http(400, { non_field_errors: ['Invalid credentials'] }))).toBe(
      'auth.error.invalid_credentials',
    ));
  it('maps 429, 5xx and network errors', () => {
    expect(loginErrorKey(http(429))).toBe('auth.error.too_many');
    expect(loginErrorKey(http(503))).toBe('auth.error.unavailable');
    expect(loginErrorKey(http(0))).toBe('auth.error.unavailable');
  });
});

describe('mfaFailure', () => {
  it('maps each server code and never exposes the raw detail', () => {
    expect(mfaFailure(http(400, { code: 'mfa_invalid_code', detail: 'Invalid code.' }))).toEqual({
      key: 'auth.error.invalid_code',
      restart: null,
    });
    expect(mfaFailure(http(400, { code: 'mfa_token_invalid', detail: 'x' }))).toEqual({
      key: 'auth.error.token_expired',
      restart: 'mfa_expired',
    });
    expect(mfaFailure(http(400, { code: 'mfa_already_enabled', detail: 'x' }))).toEqual({
      key: 'auth.error.already_enabled',
      restart: 'mfa_enrolled',
    });
    expect(mfaFailure(http(400, { code: 'mfa_locked', detail: 'x' }))).toEqual({
      key: 'auth.error.locked',
      restart: null,
    });
  });
  it('falls back to invalid code on an unknown 400 code', () =>
    expect(mfaFailure(http(400, { code: 'weird' }))).toEqual({ key: 'auth.error.invalid_code', restart: null }));
  it('maps 429, 5xx and network errors', () => {
    expect(mfaFailure(http(429)).key).toBe('auth.error.too_many');
    expect(mfaFailure(http(500)).key).toBe('auth.error.unavailable');
    expect(mfaFailure(http(0)).key).toBe('auth.error.unavailable');
  });
});
