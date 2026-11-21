import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { User } from '../../api';
import { runtimeConfig } from '../runtime-config';
import { authInterceptor } from './auth.interceptor';
import { AuthService, LOGOUT_WAIT_MS, RESTORE_TIMEOUT_MS } from './auth.service';

const auth = `${runtimeConfig().apiBaseUrl}/api/v1/auth`;
const user: User = { id: 1, username: 'renaud', mfa_enabled: true };

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  return {
    service: TestBed.inject(AuthService),
    ctrl: TestBed.inject(HttpTestingController),
    navigate,
  };
}

/** Every auth call opts in to the HttpOnly refresh cookie. */
function expectCookieMode(req: { request: { headers: { get(n: string): string | null }; withCredentials: boolean } }) {
  expect(req.request.headers.get('X-Auth-Mode')).toBe('cookie');
  expect(req.request.withCredentials).toBe(true);
}

describe('AuthService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  describe('login', () => {
    it('emits the verify step and keeps it as the pending MFA hand-off', async () => {
      const { service, ctrl } = setup();
      const step = firstValueFrom(service.login('renaud', 'pw', true));
      const req = ctrl.expectOne(`${auth}/login/`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ username: 'renaud', password: 'pw', remember_me: true });
      expectCookieMode(req);
      req.flush({ mfa_required: true, mfa_token: 't' });

      expect(await step).toEqual({ kind: 'verify', mfaToken: 't' });
      expect(service.pendingMfa()).toEqual({ kind: 'verify', mfaToken: 't' });
      expect(service.isAuthenticated()).toBe(false);
    });

    it('emits the setup step for a user not enrolled yet', async () => {
      const { service, ctrl } = setup();
      const step = firstValueFrom(service.login('renaud', 'pw', false));
      const req = ctrl.expectOne(`${auth}/login/`);
      expect(req.request.body.remember_me).toBe(false);
      req.flush({ mfa_setup_required: true, mfa_token: 't' });
      expect(await step).toEqual({ kind: 'setup', mfaToken: 't' });
    });

    it('passes the DRF 400 through untouched', async () => {
      const { service, ctrl } = setup();
      const step = firstValueFrom(service.login('renaud', 'bad', true));
      ctrl
        .expectOne(`${auth}/login/`)
        .flush({ non_field_errors: ['Invalid credentials.'] }, { status: 400, statusText: 'Bad Request' });
      const err = await step.catch((e: HttpErrorResponse) => e);
      expect(err).toBeInstanceOf(HttpErrorResponse);
      expect((err as HttpErrorResponse).error).toEqual({ non_field_errors: ['Invalid credentials.'] });
      expect(service.pendingMfa()).toBeNull();
    });
  });

  describe('MFA', () => {
    it('mfaSetup maps the enrolment payload', async () => {
      const { service, ctrl } = setup();
      const setupRes = firstValueFrom(service.mfaSetup('t'));
      const req = ctrl.expectOne(`${auth}/mfa/setup/`);
      expect(req.request.body).toEqual({ mfa_token: 't' });
      expectCookieMode(req);
      req.flush({ otpauth_uri: 'otpauth://totp/x', secret: 'S', qr_svg: 'data:image/svg+xml;base64,AA' });
      expect(await setupRes).toEqual({
        otpauthUri: 'otpauth://totp/x',
        secret: 'S',
        qrSvg: 'data:image/svg+xml;base64,AA',
      });
    });

    it('mfaVerify stores the access token in memory only', async () => {
      const { service, ctrl } = setup();
      service['pending'].set({ kind: 'verify', mfaToken: 't' });
      const done = firstValueFrom(service.mfaVerify('t', '123456'));
      const req = ctrl.expectOne(`${auth}/mfa/verify/`);
      expect(req.request.body).toEqual({ mfa_token: 't', code: '123456' });
      expectCookieMode(req);
      req.flush({ access: 'A', user });
      await done;

      expect(service.accessToken()).toBe('A');
      expect(service.user()).toEqual(user);
      expect(service.isAuthenticated()).toBe(true);
      expect(service.pendingMfa()).toBeNull();
      expect(localStorage.length).toBe(0);
      expect(sessionStorage.length).toBe(0);
    });

    it('mfaConfirm signs in and returns the recovery codes', async () => {
      const { service, ctrl } = setup();
      const done = firstValueFrom(service.mfaConfirm('t', '123456'));
      const req = ctrl.expectOne(`${auth}/mfa/setup/confirm/`);
      expect(req.request.body).toEqual({ mfa_token: 't', code: '123456' });
      expectCookieMode(req);
      req.flush({ access: 'A', user, recovery_codes: ['aaaa-bbbb', 'cccc-dddd'] });

      expect(await done).toEqual({ recoveryCodes: ['aaaa-bbbb', 'cccc-dddd'] });
      expect(service.accessToken()).toBe('A');
      expect(service.isAuthenticated()).toBe(true);
    });

    it('a rejected code leaves the user signed out', async () => {
      const { service, ctrl } = setup();
      const done = firstValueFrom(service.mfaVerify('t', '000000'));
      ctrl
        .expectOne(`${auth}/mfa/verify/`)
        .flush({ code: 'mfa_invalid_code', detail: 'Invalid code.' }, { status: 400, statusText: 'Bad Request' });
      await expect(done).rejects.toBeInstanceOf(HttpErrorResponse);
      expect(service.isAuthenticated()).toBe(false);
      expect(service.accessToken()).toBeNull();
    });
  });

  describe('restoreSession', () => {
    it('refreshes through the cookie, then loads me/ with the new Bearer', async () => {
      const { service, ctrl, navigate } = setup();
      const restored = service.restoreSession();

      const refresh = ctrl.expectOne(`${auth}/refresh/`);
      expect(refresh.request.body).toEqual({});
      expect(refresh.request.headers.has('Authorization')).toBe(false);
      expectCookieMode(refresh);
      refresh.flush({ access: 'R' });

      const me = ctrl.expectOne(`${auth}/me/`);
      expect(me.request.headers.get('Authorization')).toBe('Bearer R');
      me.flush({ user });

      await restored;
      expect(service.isAuthenticated()).toBe(true);
      expect(service.accessToken()).toBe('R');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('a missing refresh cookie leaves a guest, without throwing or navigating', async () => {
      const { service, ctrl, navigate } = setup();
      const restored = service.restoreSession();
      ctrl
        .expectOne(`${auth}/refresh/`)
        .flush(
          { code: 'refresh_cookie_missing', detail: 'No refresh cookie: sign in again.' },
          { status: 401, statusText: 'Unauthorized' },
        );

      await expect(restored).resolves.toBeUndefined();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.accessToken()).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
    });

    it('a failing me/ leaves a guest, without a second refresh', async () => {
      const { service, ctrl, navigate } = setup();
      const restored = service.restoreSession();
      ctrl.expectOne(`${auth}/refresh/`).flush({ access: 'R' });
      ctrl.expectOne(`${auth}/me/`).flush({ detail: 'nope' }, { status: 401, statusText: 'Unauthorized' });

      await expect(restored).resolves.toBeUndefined();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.accessToken()).toBeNull();
      expect(navigate).not.toHaveBeenCalled();
      ctrl.expectNone(`${auth}/refresh/`);
    });
  });

  describe('restoreSession timeout', () => {
    afterEach(() => vi.useRealTimers());

    it('a refresh answering after the timeout leaves no access token', async () => {
      vi.useFakeTimers();
      const { service, ctrl, navigate } = setup();
      const restored = service.restoreSession();
      const refresh = ctrl.expectOne(`${auth}/refresh/`);

      await vi.advanceTimersByTimeAsync(RESTORE_TIMEOUT_MS);
      await expect(restored).resolves.toBeUndefined();
      expect(service.isAuthenticated()).toBe(false);

      refresh.flush({ access: 'late' });
      expect(service.accessToken()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);
      ctrl.expectNone(`${auth}/me/`);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('is single-flight: concurrent callers share one request', async () => {
      const { service, ctrl } = setup();
      const a = firstValueFrom(service.refresh());
      const b = firstValueFrom(service.refresh());
      ctrl.expectOne(`${auth}/refresh/`).flush({ access: 'N' });
      expect(await a).toBe('N');
      expect(await b).toBe('N');

      // Once settled, the next call is a new request.
      const c = firstValueFrom(service.refresh());
      ctrl.expectOne(`${auth}/refresh/`).flush({ access: 'M' });
      expect(await c).toBe('M');
    });

    it('a rejected refresh clears the session', async () => {
      const { service, ctrl } = setup();
      service['startSession']({ access: 'A', user });
      const r = firstValueFrom(service.refresh());
      ctrl.expectOne(`${auth}/refresh/`).flush({ detail: 'blacklisted' }, { status: 401, statusText: 'Unauthorized' });
      await expect(r).rejects.toBeInstanceOf(HttpErrorResponse);
      expect(service.isAuthenticated()).toBe(false);
      expect(service.accessToken()).toBeNull();
    });
  });

  describe('logout', () => {
    it('posts logout/ in cookie mode without a Bearer, clears state and goes to /login', async () => {
      const { service, ctrl, navigate } = setup();
      service['startSession']({ access: 'A', user });
      const done = firstValueFrom(service.logout(), { defaultValue: undefined });
      const req = ctrl.expectOne(`${auth}/logout/`);
      expectCookieMode(req);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush(null, { status: 204, statusText: 'No Content' });
      await done;
      expect(service.isAuthenticated()).toBe(false);
      expect(service.accessToken()).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });

    it('clears state even if the server call fails', async () => {
      const { service, ctrl, navigate } = setup();
      service['startSession']({ access: 'A', user });
      const done = firstValueFrom(service.logout(), { defaultValue: undefined });
      ctrl.expectOne(`${auth}/logout/`).flush('boom', { status: 500, statusText: 'Server Error' });
      await expect(done).resolves.toBeUndefined();
      expect(service.isAuthenticated()).toBe(false);
      expect(service.accessToken()).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login']);
    });

    it('waits for an in-flight refresh, whose late token is discarded', () => {
      const { service, ctrl } = setup();
      service['startSession']({ access: 'A', user });
      service.refresh().subscribe({ error: () => undefined }); // e.g. a poll hit an expired token
      const refresh = ctrl.expectOne(`${auth}/refresh/`);

      service.logout();
      expect(service.accessToken()).toBeNull();
      // Sending logout/ now would race the rotation: the refresh's Set-Cookie could land last.
      ctrl.expectNone(`${auth}/logout/`);

      refresh.flush({ access: 'B' });
      expect(service.accessToken()).toBeNull();
      expect(service.isAuthenticated()).toBe(false);

      // Sent after refresh/ settled: it blacklists the rotated cookie.
      ctrl.expectOne(`${auth}/logout/`).flush(null, { status: 204, statusText: 'No Content' });
    });

    it('still posts logout/ when the in-flight refresh fails', () => {
      const { service, ctrl } = setup();
      service['startSession']({ access: 'A', user });
      service.refresh().subscribe({ error: () => undefined });
      const refresh = ctrl.expectOne(`${auth}/refresh/`);
      service.logout();
      refresh.flush('bad gateway', { status: 502, statusText: 'Bad Gateway' });
      ctrl.expectOne(`${auth}/logout/`).flush(null, { status: 204, statusText: 'No Content' });
      expect(service.accessToken()).toBeNull();
    });

    it('a hung refresh does not block logout/ beyond LOGOUT_WAIT_MS', async () => {
      vi.useFakeTimers();
      try {
        const { service, ctrl } = setup();
        service['startSession']({ access: 'A', user });
        service.refresh().subscribe({ error: () => undefined });
        const refresh = ctrl.expectOne(`${auth}/refresh/`);
        const done = firstValueFrom(service.logout(), { defaultValue: undefined });
        await vi.advanceTimersByTimeAsync(LOGOUT_WAIT_MS - 1);
        ctrl.expectNone(`${auth}/logout/`);
        await vi.advanceTimersByTimeAsync(1);
        ctrl.expectOne(`${auth}/logout/`).flush(null, { status: 204, statusText: 'No Content' });
        await expect(done).resolves.toBeUndefined();
        refresh.flush('gone', { status: 504, statusText: 'Gateway Timeout' });
      } finally {
        vi.useRealTimers();
      }
    });

    it('a stale 401 from a refresh started before logout does not clear a newer session', () => {
      const { service, ctrl } = setup();
      service['startSession']({ access: 'A', user });
      service.refresh().subscribe({ error: () => undefined });
      const refresh = ctrl.expectOne(`${auth}/refresh/`);
      service.logout();
      // Re-login while the old refresh is still pending.
      service['startSession']({ access: 'NEW', user });
      refresh.flush({ detail: 'blacklisted' }, { status: 401, statusText: 'Unauthorized' });
      expect(service.accessToken()).toBe('NEW');
      expect(service.isAuthenticated()).toBe(true);
      ctrl.expectOne(`${auth}/logout/`).flush(null, { status: 204, statusText: 'No Content' });
    });

    it('runs even when the caller does not subscribe', () => {
      const { service, ctrl } = setup();
      service['startSession']({ access: 'A', user });
      service.logout();
      expect(service.isAuthenticated()).toBe(false);
      ctrl.expectOne(`${auth}/logout/`).flush(null, { status: 204, statusText: 'No Content' });
    });
  });
});
