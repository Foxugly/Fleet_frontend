import { HttpErrorResponse } from '@angular/common/http';

/** Notices the MFA page hands back to /login (`?reason=`); anything else is ignored. */
export type LoginReason = 'mfa_expired' | 'mfa_enrolled';

export const LOGIN_REASON_KEYS: Record<LoginReason, string> = {
  mfa_expired: 'auth.error.token_expired',
  mfa_enrolled: 'auth.error.already_enabled',
};

/**
 * `returnUrl` comes from the query string, so it is attacker-controlled: only an
 * internal path is followed (starts with a single `/`, no backslash, which some
 * browsers read as `/`). Anything else goes to `/`.
 */
export function safeReturnUrl(url: string | null | undefined): string {
  if (!url || !url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return '/';
  return url;
}

function status(err: unknown): number {
  return err instanceof HttpErrorResponse ? err.status : 0;
}

/** Login 400 is DRF field errors (not `{code, detail}`): any 400/401 = bad credentials. */
export function loginErrorKey(err: unknown): string {
  const s = status(err);
  if (s === 400 || s === 401) return 'auth.error.invalid_credentials';
  if (s === 429) return 'auth.error.too_many';
  return 'auth.error.unavailable';
}

export interface MfaFailure {
  /** Transloco key of the message to show (the raw backend `detail` is never shown). */
  key: string;
  /** Set when the password step must be redone: go back to /login with this reason. */
  restart: LoginReason | null;
}

/** MFA 400 bodies are `{code, detail}`; the code (not the detail) picks the message. */
export function mfaFailure(err: unknown): MfaFailure {
  const s = status(err);
  if (s === 429) return { key: 'auth.error.too_many', restart: null };
  if (s === 400) {
    const code = (err as HttpErrorResponse).error?.code;
    switch (code) {
      case 'mfa_token_invalid':
        return { key: LOGIN_REASON_KEYS.mfa_expired, restart: 'mfa_expired' };
      case 'mfa_already_enabled':
        return { key: LOGIN_REASON_KEYS.mfa_enrolled, restart: 'mfa_enrolled' };
      case 'mfa_locked':
        return { key: 'auth.error.locked', restart: null };
      default:
        return { key: 'auth.error.invalid_code', restart: null };
    }
  }
  return { key: 'auth.error.unavailable', restart: null };
}
