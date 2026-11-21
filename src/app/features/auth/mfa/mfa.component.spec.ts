import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { mfaPendingGuard } from '../../../core/auth/auth.guard';
import { mfaLeaveGuard } from './mfa-leave.guard';
import { RouterTestingHarness } from '@angular/router/testing';
import { authTestProviders } from '../auth-test-setup.testing';
import { MfaComponent } from './mfa.component';

@Component({ template: '' })
class Stub {}

const USER = { id: 1, username: 'renaud', mfa_enabled: true };
const QR = 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=';
const signedIn = { access: 'A', user: USER };

async function setup(kind: 'verify' | 'setup' | null, url = '/mfa') {
  TestBed.configureTestingModule({
    providers: authTestProviders([
      { path: 'mfa', canActivate: [mfaPendingGuard], canDeactivate: [mfaLeaveGuard], component: MfaComponent },
      { path: 'login', component: Stub },
      { path: 'box', component: Stub },
      { path: '', component: Stub },
    ]),
  });
  const auth = TestBed.inject(AuthService);
  if (kind) auth['pending'].set({ kind, mfaToken: 'tok' });
  const router = TestBed.inject(Router);
  const http = TestBed.inject(HttpTestingController);
  await router.navigateByUrl(url);
  return { auth, router, http };
}

async function mount(kind: 'verify' | 'setup', url = '/mfa', qr = QR) {
  const ctx = await setup(kind, url);
  const fixture = TestBed.createComponent(MfaComponent);
  fixture.detectChanges();
  if (kind === 'setup') {
    ctx.http
      .expectOne((r) => r.url.endsWith('/mfa/setup/'))
      .flush({ otpauth_uri: 'otpauth://x', secret: 'JBSWY3DP', qr_svg: qr });
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return { ...ctx, fixture };
}

function type(fixture: ComponentFixture<MfaComponent>, code: string) {
  const el: HTMLElement = fixture.nativeElement;
  const input = el.querySelector<HTMLInputElement>('#mfa-code')!;
  input.value = code;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
}

async function settle(fixture: ComponentFixture<MfaComponent>) {
  await fixture.whenStable();
  fixture.detectChanges();
}

const errorText = (fixture: ComponentFixture<MfaComponent>): string =>
  fixture.nativeElement.querySelector('p-message')?.textContent ?? '';

describe('/mfa route guard', () => {
  it('redirects to /login without a pending password step', async () => {
    const { router } = await setup(null);
    expect(router.url).toBe('/login');
  });
});

describe('MfaComponent verify mode', () => {
  it('shows the one-time-code input', async () => {
    const { fixture } = await mount('verify');
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector('#mfa-code')!;
    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('inputmode')).toBe('text');
    expect(el.textContent).toContain('Code de vérification');
  });

  it('signs in and goes to returnUrl', async () => {
    const { fixture, router, http, auth } = await mount('verify', '/mfa?returnUrl=%2Fbox');
    type(fixture, '123456');
    const req = http.expectOne((r) => r.url.endsWith('/mfa/verify/'));
    expect(req.request.body).toEqual({ mfa_token: 'tok', code: '123456' });
    req.flush(signedIn);
    await fixture.whenStable();
    expect(auth.isAuthenticated()).toBe(true);
    expect(router.url).toBe('/box');
  });

  it('goes to / without a returnUrl', async () => {
    const { fixture, router, http } = await mount('verify');
    type(fixture, '123456');
    http.expectOne((r) => r.url.endsWith('/mfa/verify/')).flush(signedIn);
    await fixture.whenStable();
    expect(router.url).toBe('/');
  });

  it.each(['/mfa?returnUrl=%2F%2Fevil.example', '/mfa?returnUrl=https%3A%2F%2Fevil.example'])(
    'never navigates to an external returnUrl (%s)',
    async (url) => {
      const { fixture, router, http } = await mount('verify', url);
      type(fixture, '123456');
      http.expectOne((r) => r.url.endsWith('/mfa/verify/')).flush(signedIn);
      await fixture.whenStable();
      expect(router.url).toBe('/');
    },
  );

  it('accepts a recovery code', async () => {
    const { fixture, http } = await mount('verify');
    type(fixture, 'ABCDE-12345');
    expect(http.expectOne((r) => r.url.endsWith('/mfa/verify/')).request.body.code).toBe('ABCDE-12345');
  });

  it('does not submit an empty code', async () => {
    const { fixture, http } = await mount('verify');
    type(fixture, '  ');
    http.expectNone((r) => r.url.endsWith('/mfa/verify/'));
  });

  it('shows « Code invalide. » on mfa_invalid_code, never the raw detail', async () => {
    const { fixture, http } = await mount('verify');
    type(fixture, '000000');
    http
      .expectOne((r) => r.url.endsWith('/mfa/verify/'))
      .flush({ code: 'mfa_invalid_code', detail: 'RAW-BACKEND-DETAIL' }, { status: 400, statusText: 'Bad Request' });
    await settle(fixture);
    expect(errorText(fixture)).toContain('Code invalide.');
    expect(fixture.nativeElement.textContent).not.toContain('RAW-BACKEND-DETAIL');
  });

  it('falls back to « Code invalide. » on an unknown code', async () => {
    const { fixture, http } = await mount('verify');
    type(fixture, '000000');
    http
      .expectOne((r) => r.url.endsWith('/mfa/verify/'))
      .flush({ code: 'new_code' }, { status: 400, statusText: 'Bad Request' });
    await settle(fixture);
    expect(errorText(fixture)).toContain('Code invalide.');
  });

  it('shows the rate-limit message on 429', async () => {
    const { fixture, http } = await mount('verify');
    type(fixture, '000000');
    http.expectOne((r) => r.url.endsWith('/mfa/verify/')).flush({}, { status: 429, statusText: 'Too Many Requests' });
    await settle(fixture);
    expect(errorText(fixture)).toContain('Trop de tentatives, réessayez plus tard.');
  });

  it('shows « Service indisponible. » on 5xx', async () => {
    const { fixture, http } = await mount('verify');
    type(fixture, '000000');
    http.expectOne((r) => r.url.endsWith('/mfa/verify/')).flush({}, { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(errorText(fixture)).toContain('Service indisponible.');
  });

  it('sends an expired sign-in back to /login with the message and keeps returnUrl', async () => {
    const { fixture, router, http, auth } = await mount('verify', '/mfa?returnUrl=%2Fbox');
    type(fixture, '000000');
    http
      .expectOne((r) => r.url.endsWith('/mfa/verify/'))
      .flush({ code: 'mfa_token_invalid', detail: 'x' }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    expect(router.url).toBe('/login?returnUrl=%2Fbox&reason=mfa_expired');
    expect(auth.pendingMfa()).toBeNull();
  });
});

describe('MfaComponent setup mode', () => {
  it('shows the QR for a data:image/svg+xml URI, and the secret', async () => {
    const { fixture } = await mount('setup');
    const img = fixture.nativeElement.querySelector('img.mfa-qr') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(QR);
    expect(fixture.nativeElement.querySelector('#mfa-secret').value).toBe('JBSWY3DP');
    expect(fixture.nativeElement.textContent).toContain('Activer la double authentification');
  });

  it.each(['https://evil.example/q.png', 'data:text/html;base64,PGI+', 'javascript:alert(1)'])(
    'refuses to bind %s as the QR',
    async (bad) => {
      const { fixture } = await mount('setup', '/mfa', bad);
      expect(fixture.nativeElement.querySelector('img.mfa-qr')).toBeNull();
      expect(fixture.nativeElement.querySelector('#mfa-secret').value).toBe('JBSWY3DP');
    },
  );

  async function enrol() {
    const ctx = await mount('setup', '/mfa?returnUrl=%2Fbox');
    type(ctx.fixture, '123456');
    const req = ctx.http.expectOne((r) => r.url.endsWith('/mfa/setup/confirm/'));
    expect(req.request.body).toEqual({ mfa_token: 'tok', code: '123456' });
    req.flush({ ...signedIn, recovery_codes: ['AAAAA-11111', 'BBBBB-22222'] });
    await settle(ctx.fixture);
    return ctx;
  }

  it('shows the recovery codes after confirming; « Continuer » stays disabled until the box is ticked', async () => {
    const { fixture, router } = await enrol();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('AAAAA-11111');
    expect(el.textContent).toContain('BBBBB-22222');
    const cont = () => el.querySelector<HTMLButtonElement>('button.mfa-continue')!;
    expect(cont().disabled).toBe(true);
    cont().click();
    await fixture.whenStable();
    expect(router.url).toBe('/mfa?returnUrl=%2Fbox');

    el.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    fixture.detectChanges();
    expect(cont().disabled).toBe(false);
    cont().click();
    await fixture.whenStable();
    expect(router.url).toBe('/box');
  });

  it('asks the browser to confirm leaving while the codes are unacknowledged', async () => {
    await enrol();
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('shows « Code invalide. » on a wrong first code', async () => {
    const { fixture, http } = await mount('setup');
    type(fixture, '000000');
    http
      .expectOne((r) => r.url.endsWith('/mfa/setup/confirm/'))
      .flush({ code: 'mfa_invalid_code', detail: 'x' }, { status: 400, statusText: 'Bad Request' });
    await settle(fixture);
    expect(errorText(fixture)).toContain('Code invalide.');
  });

  it('sends an already-enrolled account back to /login with the message', async () => {
    const ctx = await setup('setup');
    const fixture = TestBed.createComponent(MfaComponent);
    fixture.detectChanges();
    ctx.http
      .expectOne((r) => r.url.endsWith('/mfa/setup/'))
      .flush({ code: 'mfa_already_enabled', detail: 'x' }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    expect(ctx.router.url).toBe('/login?reason=mfa_enrolled');
  });
});

describe('MfaComponent leave guard (recovery codes)', () => {
  async function enrolViaRouter() {
    const ctx = await setup('setup', '/box');
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/mfa', MfaComponent);
    ctx.http
      .expectOne((r) => r.url.endsWith('/mfa/setup/'))
      .flush({ otpauth_uri: 'o', secret: 'JBSWY3DP', qr_svg: QR });
    harness.detectChanges();
    const el: HTMLElement = harness.routeNativeElement as HTMLElement;
    const input = el.querySelector<HTMLInputElement>('#mfa-code')!;
    input.value = '123456';
    input.dispatchEvent(new Event('input'));
    harness.detectChanges();
    el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    ctx.http
      .expectOne((r) => r.url.endsWith('/mfa/setup/confirm/'))
      .flush({ ...signedIn, recovery_codes: ['AAAAA-11111'] });
    harness.detectChanges();
    return { ...ctx, harness, component, el };
  }

  it('refuses router navigation while the codes are unacknowledged, shows the reminder, then allows it once ticked', async () => {
    const { router, harness, el } = await enrolViaRouter();
    expect(el.textContent).toContain('AAAAA-11111');

    expect(await router.navigateByUrl('/')).toBe(false);
    harness.detectChanges();
    expect(router.url).toBe('/mfa');
    expect(el.textContent).toContain('AAAAA-11111');
    expect(el.querySelector('p-message')!.textContent).toContain('Cochez');

    el.querySelector<HTMLInputElement>('input[type=checkbox]')!.click();
    harness.detectChanges();
    expect(await router.navigateByUrl('/')).toBe(true);
    expect(router.url).toBe('/');
  });
});
