import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { authTestProviders } from '../../features/auth/auth-test-setup.testing';
import { AgePipe } from './age.pipe';
import { Clock } from './clock';

const NOW = new Date('2026-11-21T12:00:00Z');
const ago = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();

async function pipe(): Promise<AgePipe> {
  TestBed.configureTestingModule({
    providers: [...authTestProviders(), { provide: Clock, useValue: { now: () => NOW } }],
  });
  await new Promise<void>((resolve) => TestBed.inject(TranslocoService).load('fr').subscribe(() => resolve()));
  return TestBed.runInInjectionContext(() => new AgePipe());
}

describe('AgePipe', () => {
  it.each([
    [0, "à l'instant"],
    [59, "à l'instant"],
    [60, 'il y a 1 min'],
    [5 * 60, 'il y a 5 min'],
    [3 * 3600, 'il y a 3 h'],
    [2 * 86400, 'il y a 2 j'],
  ])('%i s ago -> %s', async (seconds, expected) => {
    expect((await pipe()).transform(ago(seconds))).toBe(expected);
  });

  it('null -> jamais collecté (never NaN)', async () => {
    expect((await pipe()).transform(null)).toBe('jamais collecté');
  });

  it('unparsable date -> jamais collecté', async () => {
    expect((await pipe()).transform('not a date')).toBe('jamais collecté');
  });

  it('a date slightly in the future (clock skew) -> à l\'instant', async () => {
    expect((await pipe()).transform(ago(-30))).toBe("à l'instant");
  });
});
