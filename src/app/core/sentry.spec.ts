import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/angular';

import { initSentry } from './sentry';

vi.mock('@sentry/angular', () => ({ init: vi.fn() }));

describe('initSentry', () => {
  beforeEach(() => vi.mocked(Sentry.init).mockClear());

  it.each([undefined, { dsn: '', environment: 'prod', release: 'x' }])(
    'is a no-op without a DSN (%j)',
    (cfg) => {
      expect(initSentry(cfg)).toBe(false);
      expect(Sentry.init).not.toHaveBeenCalled();
    },
  );

  it('inits without PII and with the scrubbers when a DSN is set', () => {
    expect(
      initSentry({
        dsn: 'https://k@o.ingest.de.sentry.io/1',
        environment: 'production',
        release: 'abc',
      }),
    ).toBe(true);
    const opts = vi.mocked(Sentry.init).mock.calls[0][0]!;
    expect(opts.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
    });
    expect(opts.environment).toBe('production');
    expect(opts.release).toBe('abc');
    expect(typeof opts.beforeSend).toBe('function');
    expect(typeof opts.beforeBreadcrumb).toBe('function');
  });
});
