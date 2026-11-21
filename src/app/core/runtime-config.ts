import { isDevMode } from '@angular/core';

export interface FleetRuntimeConfig {
  apiBaseUrl: string;
}

declare global {
  interface Window {
    /** Injected by the deploy (SSM) before bootstrap; absent in dev. */
    __FLEET__?: Partial<FleetRuntimeConfig>;
    __FLEET_VERSION?: string;
  }
}

/** Local dev API, used only in dev mode when nothing is injected. */
const DEV_API_BASE_URL = 'http://127.0.0.1:8000';

/**
 * Runtime config: `window.__FLEET__` if injected, else the local dev API (dev mode
 * only). A production build without an injected URL throws at startup, and an
 * injected value must be an absolute http(s) URL: a relative one (`'/'`) would
 * make the interceptor's API-prefix match every relative URL.
 */
export function runtimeConfig(devMode: boolean = isDevMode()): FleetRuntimeConfig {
  const injected = typeof window !== 'undefined' ? window.__FLEET__?.apiBaseUrl : undefined;
  if (injected === undefined && !devMode) {
    throw new Error('Fleet: window.__FLEET__.apiBaseUrl is not set (the deploy must inject the API base URL).');
  }
  const apiBaseUrl = (injected ?? DEV_API_BASE_URL).trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+/.test(apiBaseUrl)) {
    throw new Error(`Fleet: window.__FLEET__.apiBaseUrl must be an absolute http(s) URL, got ${JSON.stringify(injected)}.`);
  }
  return { apiBaseUrl };
}
