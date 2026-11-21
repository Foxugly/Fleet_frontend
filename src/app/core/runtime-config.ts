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

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

/** Runtime config: `window.__FLEET__` if injected, else the local dev API. */
export function runtimeConfig(): FleetRuntimeConfig {
  const injected = typeof window !== 'undefined' ? window.__FLEET__?.apiBaseUrl : undefined;
  const apiBaseUrl = (injected || DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  return { apiBaseUrl };
}
