import { runtimeConfig } from './runtime-config';

describe('runtimeConfig', () => {
  afterEach(() => {
    delete window.__FLEET__;
  });

  it('defaults to the local dev API in dev mode', () => {
    expect(runtimeConfig(true).apiBaseUrl).toBe('http://127.0.0.1:8000');
  });

  it('throws a clear error in a production build without an injected URL', () => {
    expect(() => runtimeConfig(false)).toThrow(/window\.__FLEET__\.apiBaseUrl/);
  });

  it('reads window.__FLEET__ and strips the trailing slash', () => {
    window.__FLEET__ = { apiBaseUrl: 'https://fleet-api.foxugly.com/' };
    expect(runtimeConfig(false).apiBaseUrl).toBe('https://fleet-api.foxugly.com');
  });

  it.each(['', '/', 'fleet-api.foxugly.com', '//fleet-api.foxugly.com', 'https://', 'ftp://x'])(
    'rejects the non-absolute injected value %j, even in dev mode',
    (value) => {
      window.__FLEET__ = { apiBaseUrl: value };
      expect(() => runtimeConfig(true)).toThrow(/absolute http\(s\) URL/);
    },
  );
});

describe('runtimeConfig sentry', () => {
  afterEach(() => {
    delete window.__FLEET__;
  });

  it('is undefined when not injected or empty', () => {
    window.__FLEET__ = { apiBaseUrl: 'https://a.test' };
    expect(runtimeConfig(false).sentry).toBeUndefined();
  });

  it('passes the injected sentry object through', () => {
    const sentry = { dsn: 'https://k@o.ingest.de.sentry.io/1', environment: 'production', release: 'abc' };
    window.__FLEET__ = { apiBaseUrl: 'https://a.test', sentry };
    expect(runtimeConfig(false).sentry).toEqual(sentry);
  });
});
