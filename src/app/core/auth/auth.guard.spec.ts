import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';

import { authGuard, mfaPendingGuard } from './auth.guard';
import { AuthService } from './auth.service';

function setup() {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  return { service: TestBed.inject(AuthService), router: TestBed.inject(Router) };
}

const state = (url: string) => ({ url }) as RouterStateSnapshot;
const route = {} as ActivatedRouteSnapshot;

describe('authGuard', () => {
  it('redirects a guest to /login with returnUrl', () => {
    const { router } = setup();
    const result = TestBed.runInInjectionContext(() => authGuard(route, state('/sites/quizonline')));
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login?returnUrl=%2Fsites%2Fquizonline');
  });

  it('lets an authenticated user through', () => {
    const { service } = setup();
    service['startSession']({ access: 'A', user: { id: 1, username: 'renaud', mfa_enabled: true } });
    expect(TestBed.runInInjectionContext(() => authGuard(route, state('/')))).toBe(true);
  });
});

describe('mfaPendingGuard', () => {
  it('sends /mfa without a pending password step back to /login', () => {
    const { router } = setup();
    const result = TestBed.runInInjectionContext(() => mfaPendingGuard(route, state('/mfa')));
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('allows /mfa after the password step', () => {
    const { service } = setup();
    service['pending'].set({ kind: 'verify', mfaToken: 't' });
    expect(TestBed.runInInjectionContext(() => mfaPendingGuard(route, state('/mfa')))).toBe(true);
  });
});
