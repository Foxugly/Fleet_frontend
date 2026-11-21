import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { User } from '../../api';
import { runtimeConfig } from '../runtime-config';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const api = runtimeConfig().apiBaseUrl;
const auth = `${api}/api/v1/auth`;
const overview = `${api}/api/v1/overview/`;
const user: User = { id: 1, username: 'renaud', mfa_enabled: true };
const unauthorized = { status: 401, statusText: 'Unauthorized' };

/** Signed in with access token 'A' in memory (the refresh token is in the cookie). */
function signedIn() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor])),
      provideHttpClientTesting(),
    ],
  });
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  vi.spyOn(router, 'url', 'get').mockReturnValue('/sites/quizonline');
  const service = TestBed.inject(AuthService);
  service['startSession']({ access: 'A', user });
  return { http: TestBed.inject(HttpClient), ctrl: TestBed.inject(HttpTestingController), service, navigate };
}

describe('authInterceptor', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('attaches the Bearer to API calls but not to the anonymous auth calls', () => {
    const { http, ctrl, service } = signedIn();
    http.get(overview).subscribe();
    expect(ctrl.expectOne(overview).request.headers.get('Authorization')).toBe('Bearer A');

    // me/ is an authenticated auth endpoint: it needs the Bearer (server contract).
    http.get(`${auth}/me/`).subscribe();
    expect(ctrl.expectOne(`${auth}/me/`).request.headers.get('Authorization')).toBe('Bearer A');

    service.login('renaud', 'pw', true).subscribe();
    const login = ctrl.expectOne(`${auth}/login/`);
    expect(login.request.headers.has('Authorization')).toBe(false);
    login.flush({ mfa_required: true, mfa_token: 't' });

    service.mfaVerify('t', '123456').subscribe();
    const verify = ctrl.expectOne(`${auth}/mfa/verify/`);
    expect(verify.request.headers.has('Authorization')).toBe(false);
    verify.flush({ access: 'A', user });

    service.refresh().subscribe();
    const refresh = ctrl.expectOne(`${auth}/refresh/`);
    expect(refresh.request.headers.has('Authorization')).toBe(false);
    refresh.flush({ access: 'A2' });
  });

  it('never attaches the Bearer to a foreign host', () => {
    const { http, ctrl } = signedIn();
    http.get('https://example.org/api/v1/overview/').subscribe();
    expect(ctrl.expectOne('https://example.org/api/v1/overview/').request.headers.has('Authorization')).toBe(false);
  });

  it('two concurrent 401s trigger a single refresh, then both requests are replayed', () => {
    const { http, ctrl, service } = signedIn();
    const results: unknown[] = [];
    http.get(overview).subscribe((r) => results.push(r));
    http.get(overview).subscribe((r) => results.push(r));

    const first = ctrl.match(overview);
    expect(first.length).toBe(2);
    first.forEach((r) => r.flush({ detail: 'expired' }, unauthorized));

    // Rotation blacklists the presented token: a second refresh would log the user out.
    ctrl.expectOne(`${auth}/refresh/`).flush({ access: 'B' });
    ctrl.expectNone(`${auth}/refresh/`);

    const replays = ctrl.match(overview);
    expect(replays.length).toBe(2);
    replays.forEach((r) => {
      expect(r.request.headers.get('Authorization')).toBe('Bearer B');
      r.flush({ ok: true });
    });
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(service.accessToken()).toBe('B');
  });

  it('a 401 after the refresh logs out (no loop)', () => {
    const { http, ctrl, service, navigate } = signedIn();
    let error: HttpErrorResponse | undefined;
    http.get(overview).subscribe({ error: (e) => (error = e) });

    ctrl.expectOne(overview).flush({ detail: 'expired' }, unauthorized);
    ctrl.expectOne(`${auth}/refresh/`).flush({ access: 'B' });
    ctrl.expectOne(overview).flush({ detail: 'still no' }, unauthorized);

    ctrl.expectOne(`${auth}/logout/`).flush(null, { status: 204, statusText: 'No Content' });
    ctrl.expectNone(`${auth}/refresh/`);
    ctrl.expectNone(overview);
    expect(error?.status).toBe(401);
    expect(service.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });

  it('a rejected refresh clears the session and goes to /login with returnUrl', () => {
    const { http, ctrl, service, navigate } = signedIn();
    let error: HttpErrorResponse | undefined;
    http.get(overview).subscribe({ error: (e) => (error = e) });

    ctrl.expectOne(overview).flush({ detail: 'expired' }, unauthorized);
    ctrl
      .expectOne(`${auth}/refresh/`)
      .flush({ code: 'token_not_valid', detail: 'Token is blacklisted' }, unauthorized);

    ctrl.expectNone(overview);
    expect(error?.status).toBe(401);
    expect(service.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/sites/quizonline' } });
  });

  it('a transient refresh failure keeps the session and surfaces the error', () => {
    const { http, ctrl, service, navigate } = signedIn();
    let error: HttpErrorResponse | undefined;
    http.get(overview).subscribe({ error: (e) => (error = e) });

    ctrl.expectOne(overview).flush({ detail: 'expired' }, unauthorized);
    ctrl.expectOne(`${auth}/refresh/`).flush('bad gateway', { status: 502, statusText: 'Bad Gateway' });

    expect(error?.status).toBe(502);
    expect(service.isAuthenticated()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('leaves non-401 errors alone', () => {
    const { http, ctrl } = signedIn();
    let error: HttpErrorResponse | undefined;
    http.get(overview).subscribe({ error: (e) => (error = e) });
    ctrl.expectOne(overview).flush('down', { status: 503, statusText: 'Service Unavailable' });
    ctrl.expectNone(`${auth}/refresh/`);
    expect(error?.status).toBe(503);
  });
});
