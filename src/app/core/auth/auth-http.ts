import { HttpContextToken, HttpHeaders } from '@angular/common/http';

import { runtimeConfig } from '../runtime-config';

/** Prefix of every auth endpoint, derived from the API base so it cannot drift. */
export function authApiBase(): string {
  return `${runtimeConfig().apiBaseUrl}/api/v1/auth`;
}

/**
 * Cookie mode (Fleet_server `apps/api_auth/refresh_cookie.py`): the server keeps
 * the refresh token in an HttpOnly cookie scoped to `/api/v1/auth/` and leaves it
 * out of the JSON body. `withCredentials` lets the browser store / send that
 * cookie on these cross-origin calls. Read calls stay plain Bearer, no credentials.
 */
export function cookieAuthOptions(): { headers: HttpHeaders; withCredentials: true } {
  return { headers: new HttpHeaders({ 'X-Auth-Mode': 'cookie' }), withCredentials: true };
}

/** Anonymous auth endpoints: no Bearer, and a 401 never triggers a refresh
 * (refreshing on the refresh call's own 401 would loop). `me/` is not one of them. */
const ANONYMOUS_AUTH_PATHS = ['login/', 'mfa/', 'refresh/', 'logout/'];

export function isAnonymousAuthEndpoint(url: string): boolean {
  const base = `${authApiBase()}/`;
  return url.startsWith(base) && ANONYMOUS_AUTH_PATHS.some((p) => url.slice(base.length).startsWith(p));
}

/** Set on a request that must not go through refresh-and-replay on a 401
 * (the boot-time `me/`, which already follows a fresh refresh). */
export const NO_AUTH_RETRY = new HttpContextToken<boolean>(() => false);
