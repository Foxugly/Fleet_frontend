import { TestBed } from '@angular/core/testing';

describe('api config', () => {
  afterEach(() => {
    delete window.__FLEET__;
  });

  it('uses the runtime base path', async () => {
    window.__FLEET__ = { apiBaseUrl: 'https://x.test' };
    // app.config reads the runtime config when evaluated, so import it fresh.
    vi.resetModules();
    const { appConfig } = await import('../app.config');
    const { Configuration: FreshConfiguration } = await import('../api');
    TestBed.configureTestingModule({ providers: appConfig.providers });
    const conf = TestBed.inject(FreshConfiguration);
    expect(conf.basePath).toBe('https://x.test');
    expect(conf.withCredentials).toBe(false);
  });
});
