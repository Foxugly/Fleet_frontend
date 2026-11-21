import { runtimeConfig } from './runtime-config';

describe('runtimeConfig', () => {
  afterEach(() => {
    delete window.__FLEET__;
  });

  it('defaults to the local dev API', () => {
    expect(runtimeConfig().apiBaseUrl).toBe('http://127.0.0.1:8000');
  });

  it('reads window.__FLEET__ and strips the trailing slash', () => {
    window.__FLEET__ = { apiBaseUrl: 'https://fleet-api.foxugly.com/' };
    expect(runtimeConfig().apiBaseUrl).toBe('https://fleet-api.foxugly.com');
  });

  it('falls back to the default when the injected value is empty', () => {
    window.__FLEET__ = { apiBaseUrl: '' };
    expect(runtimeConfig().apiBaseUrl).toBe('http://127.0.0.1:8000');
  });
});
