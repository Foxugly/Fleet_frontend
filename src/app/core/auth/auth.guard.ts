import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthService } from './auth.service';

/** Authenticated area: guests go to /login, carrying where they wanted to go.
 * Runs after the boot-time `restoreSession()`, so a remembered session survives a reload. */
export const authGuard: CanActivateFn = (_route, state) => {
  if (inject(AuthService).isAuthenticated()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** `/mfa` needs the password step's hand-off (memory only): without it, back to /login. */
export const mfaPendingGuard: CanActivateFn = () => {
  if (inject(AuthService).pendingMfa()) return true;
  return inject(Router).createUrlTree(['/login']);
};
