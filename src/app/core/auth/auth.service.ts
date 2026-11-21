import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

export interface CurrentUser {
  username: string;
}

/**
 * TEMPORARY mock auth, replaced by the real cookie/JWT + TOTP service in Task 4.
 * Any credentials "log in"; state lives in memory only (never web storage: the
 * access token must not be readable from storage).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly router = inject(Router);

  private readonly _user = signal<CurrentUser | null>(null);

  readonly currentUser = this._user.asReadonly();
  readonly isLoggedIn = computed(() => this._user() !== null);

  /** MOCK: accept any username/password. */
  login(username: string, _password: string, _rememberMe: boolean): void {
    this._user.set({ username });
  }

  logout(): void {
    this._user.set(null);
    void this.router.navigate(['/login']);
  }
}
