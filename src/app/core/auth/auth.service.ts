import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
  timeout,
} from 'rxjs';

import type { LoginResponse, MeResponse, MfaSetupResponse, TokenRefreshResponse, TokenResponse } from '../../api';
import { NO_AUTH_RETRY, authApiBase, cookieAuthOptions } from './auth-http';
import { LoginStep, MfaSetup, User } from './auth.models';

/** Upper bound on the boot-time restore, so a hung API never blocks the SPA. */
export const RESTORE_TIMEOUT_MS = 10_000;

/** 401/403 from refresh/ = the refresh token was rejected (absent, expired,
 * blacklisted). Anything else (network, 5xx, 429) is transient. */
export function isRejectedRefresh(err: unknown): boolean {
  return err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403);
}

/**
 * Cookie-mode session with mandatory TOTP (Fleet_server `apps/api_auth/views.py`).
 *
 * Password step (`login/`) then `mfa/verify/`, or `mfa/setup/` + `mfa/setup/confirm/`
 * for a user not enrolled yet; only the second factor signs in. Every auth call
 * sends `X-Auth-Mode: cookie` + `withCredentials`: the refresh token lives in an
 * HttpOnly cookie, the access token and the user in memory only (never web
 * storage). A reload restores them through `refresh/` (cookie) + `me/`.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly base = authApiBase();

  private readonly access = signal<string | null>(null);
  private readonly currentUser = signal<User | null>(null);
  /** Password step to MFA page hand-off (memory only). */
  private readonly pending = signal<LoginStep | null>(null);

  readonly user = this.currentUser.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly pendingMfa = this.pending.asReadonly();

  /** Single flight: concurrent callers share one refresh (rotation blacklists
   * the presented token, so a second concurrent refresh would log the user out). */
  private refreshInFlight: Observable<string> | null = null;

  accessToken(): string | null {
    return this.access();
  }

  /** Password step. Never signs in; a 400 carries DRF field errors (`non_field_errors`, ...). */
  login(username: string, password: string, rememberMe: boolean): Observable<LoginStep> {
    return this.http
      .post<LoginResponse>(
        `${this.base}/login/`,
        { username, password, remember_me: rememberMe },
        cookieAuthOptions(),
      )
      .pipe(
        map(
          (res): LoginStep =>
            res.mfa_setup_required
              ? { kind: 'setup', mfaToken: res.mfa_token }
              : { kind: 'verify', mfaToken: res.mfa_token },
        ),
        tap((step) => this.pending.set(step)),
      );
  }

  mfaSetup(mfaToken: string): Observable<MfaSetup> {
    return this.http
      .post<MfaSetupResponse>(`${this.base}/mfa/setup/`, { mfa_token: mfaToken }, cookieAuthOptions())
      .pipe(map((res) => ({ otpauthUri: res.otpauth_uri, secret: res.secret, qrSvg: res.qr_svg })));
  }

  /** First code: enables MFA and signs in. The recovery codes exist in this response only. */
  mfaConfirm(mfaToken: string, code: string): Observable<{ recoveryCodes: string[] }> {
    return this.http
      .post<TokenResponse>(`${this.base}/mfa/setup/confirm/`, { mfa_token: mfaToken, code }, cookieAuthOptions())
      .pipe(
        tap((res) => this.startSession(res)),
        map((res) => ({ recoveryCodes: res.recovery_codes ?? [] })),
      );
  }

  /** A TOTP code (or a one-time recovery code) signs in. */
  mfaVerify(mfaToken: string, code: string): Observable<void> {
    return this.http
      .post<TokenResponse>(`${this.base}/mfa/verify/`, { mfa_token: mfaToken, code }, cookieAuthOptions())
      .pipe(
        tap((res) => this.startSession(res)),
        map(() => undefined),
      );
  }

  /**
   * New access token from the refresh cookie (the server rotates the cookie).
   * A rejected refresh (401/403) clears the session; a transient failure keeps it
   * (the cookie is still valid, the next call retries). Errors are re-thrown.
   */
  refresh(): Observable<string> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.http
        .post<TokenRefreshResponse>(`${this.base}/refresh/`, {}, cookieAuthOptions())
        .pipe(
          map((res) => res.access),
          tap((access) => this.access.set(access)),
          catchError((err: unknown) => {
            if (isRejectedRefresh(err)) this.clearSession();
            return throwError(() => err);
          }),
          finalize(() => (this.refreshInFlight = null)),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }
    return this.refreshInFlight;
  }

  /**
   * Boot-time restore (app initializer): one cookie refresh, then `me/`. Never
   * rejects (a guest is a normal outcome) and never navigates: the guard decides.
   */
  async restoreSession(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.refresh().pipe(
          switchMap(() =>
            this.http.get<MeResponse>(`${this.base}/me/`, {
              context: new HttpContext().set(NO_AUTH_RETRY, true),
            }),
          ),
          timeout(RESTORE_TIMEOUT_MS),
        ),
      );
      this.currentUser.set(res.user);
    } catch {
      this.clearSession();
    }
  }

  /**
   * Server logout (cookie mode, no Bearer: blacklists the cookie's refresh token
   * and clears the cookie), best effort. Runs eagerly, subscribed or not: local
   * state is cleared and the router goes to /login right away; the returned
   * observable completes once the server call settled, and never errors.
   */
  logout(): Observable<void> {
    const done$ = this.http.post(`${this.base}/logout/`, {}, cookieAuthOptions()).pipe(
      catchError(() => of(null)),
      map(() => undefined),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    done$.subscribe();
    this.clearSession();
    void this.router.navigate(['/login']);
    return done$;
  }

  /** Drop the local session (memory only; the cookie is the server's business). */
  clearSession(): void {
    this.access.set(null);
    this.currentUser.set(null);
    this.pending.set(null);
  }

  private startSession(res: { access: string; user: User }): void {
    this.access.set(res.access);
    this.currentUser.set(res.user);
    this.pending.set(null);
  }
}
