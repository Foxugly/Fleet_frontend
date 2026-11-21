import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { runtimeConfig } from '../runtime-config';
import { NO_AUTH_RETRY, isAnonymousAuthEndpoint } from './auth-http';
import { AuthService, isRejectedRefresh } from './auth.service';

function withBearer<T>(req: HttpRequest<T>, token: string): HttpRequest<T> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Attaches the in-memory access token to API calls (URL under `apiBaseUrl`, except
 * the anonymous auth endpoints). On a 401 it refreshes once through the cookie
 * (single flight, shared by concurrent 401s) and replays the request; a second
 * 401 logs out. A rejected refresh sends the user to /login with `returnUrl`; a
 * transient refresh failure only surfaces the error (the session is kept).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const isApi = req.url.startsWith(`${runtimeConfig().apiBaseUrl}/`);
  if (!isApi || isAnonymousAuthEndpoint(req.url)) return next(req);

  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.accessToken();
  const sent = token && !req.headers.has('Authorization') ? withBearer(req, token) : req;

  return next(sent).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) return throwError(() => err);
      // A guest (or a session a parallel refresh just ended) has nothing to refresh.
      if (req.context.get(NO_AUTH_RETRY) || auth.accessToken() === null) return throwError(() => err);

      return auth.refresh().pipe(
        catchError((refreshErr: unknown) => {
          if (!isRejectedRefresh(refreshErr)) return throwError(() => refreshErr);
          void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
          return throwError(() => err);
        }),
        switchMap((newAccess) =>
          next(withBearer(req, newAccess)).pipe(
            catchError((replayErr: unknown) => {
              if (replayErr instanceof HttpErrorResponse && replayErr.status === 401) auth.logout();
              return throwError(() => replayErr);
            }),
          ),
        ),
      );
    }),
  );
};
