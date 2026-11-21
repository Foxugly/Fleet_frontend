import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';

import { authTestProviders } from '../auth-test-setup.testing';
import { LoginComponent } from './login.component';

@Component({ template: '' })
class Stub {}

async function setup(url = '/login') {
  TestBed.configureTestingModule({
    providers: authTestProviders([
      { path: 'login', component: LoginComponent },
      { path: 'mfa', component: Stub },
    ]),
  });
  const router = TestBed.inject(Router);
  await router.navigateByUrl(url);
  const fixture = TestBed.createComponent(LoginComponent);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, router, http: TestBed.inject(HttpTestingController) };
}

function fill(fixture: ComponentFixture<LoginComponent>, user = 'renaud', pwd = 'pw') {
  const el: HTMLElement = fixture.nativeElement;
  const u = el.querySelector<HTMLInputElement>('#login-username')!;
  const p = el.querySelector<HTMLInputElement>('#login-password')!;
  u.value = user;
  u.dispatchEvent(new Event('input'));
  p.value = pwd;
  p.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  el.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
}

describe('LoginComponent', () => {
  it('renders the card with the lock icon and nothing but the standard fields', async () => {
    const { fixture } = await setup();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.auth-brand-icon')!.className).toContain('pi-lock');
    expect(el.textContent).toContain('Connexion');
    expect(el.querySelector('#login-username')!.getAttribute('autocomplete')).toBe('username');
    expect(el.querySelector('#login-password')!.getAttribute('autocomplete')).toBe('current-password');
    expect(el.querySelector('a')).toBeNull();
  });

  it('submits (remember me on by default) and routes to /mfa', async () => {
    const { fixture, router, http } = await setup();
    fill(fixture);
    const req = http.expectOne((r) => r.url.endsWith('/api/v1/auth/login/'));
    expect(req.request.body).toEqual({ username: 'renaud', password: 'pw', remember_me: true });
    req.flush({ mfa_required: true, mfa_token: 't' });
    await fixture.whenStable();
    expect(router.url).toBe('/mfa');
  });

  it('carries returnUrl over to /mfa', async () => {
    const { fixture, router, http } = await setup('/login?returnUrl=%2Fbox');
    fill(fixture);
    http.expectOne((r) => r.url.endsWith('/login/')).flush({ mfa_required: true, mfa_token: 't' });
    await fixture.whenStable();
    expect(router.url).toBe('/mfa?returnUrl=%2Fbox');
  });

  it('shows « Identifiants invalides. » on a DRF 400 and stays on the page', async () => {
    const { fixture, router, http } = await setup();
    fill(fixture);
    http
      .expectOne((r) => r.url.endsWith('/login/'))
      .flush({ non_field_errors: ['Invalid credentials'] }, { status: 400, statusText: 'Bad Request' });
    await fixture.whenStable();
    fixture.detectChanges();
    const msg = fixture.nativeElement.querySelector('p-message');
    expect(msg.textContent).toContain('Identifiants invalides.');
    expect(router.url).toBe('/login');
  });

  it('shows the rate-limit message on 429', async () => {
    const { fixture, http } = await setup();
    fill(fixture);
    http.expectOne((r) => r.url.endsWith('/login/')).flush({}, { status: 429, statusText: 'Too Many Requests' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p-message').textContent).toContain(
      'Trop de tentatives, réessayez plus tard.',
    );
  });

  it('shows « Service indisponible. » on a 5xx', async () => {
    const { fixture, http } = await setup();
    fill(fixture);
    http.expectOne((r) => r.url.endsWith('/login/')).flush({}, { status: 502, statusText: 'Bad Gateway' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('p-message').textContent).toContain('Service indisponible.');
  });

  it('shows the expired-sign-in notice handed back by the MFA page', async () => {
    const { fixture } = await setup('/login?reason=mfa_expired');
    expect(fixture.nativeElement.querySelector('p-message').textContent).toContain('Votre connexion a expiré');
  });

  it('ignores an unknown reason', async () => {
    const { fixture } = await setup('/login?reason=other');
    expect(fixture.nativeElement.querySelector('p-message')).toBeNull();
  });
});
