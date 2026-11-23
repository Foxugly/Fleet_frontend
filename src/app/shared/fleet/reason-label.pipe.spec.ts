import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { Cell, StateEnum } from '../../api';
import { authTestProviders } from '../../features/auth/auth-test-setup.testing';
import { ReasonLabelPipe } from './reason-label.pipe';

async function pipe(): Promise<ReasonLabelPipe> {
  TestBed.configureTestingModule({ providers: [...authTestProviders()] });
  await new Promise<void>((resolve) => TestBed.inject(TranslocoService).load('fr').subscribe(() => resolve()));
  return TestBed.runInInjectionContext(() => new ReasonLabelPipe());
}

const cell = (state: StateEnum, count: number, reason: Cell['reason']): Cell => ({
  state,
  count,
  collected_at: null,
  error: '',
  reason,
  notes: [],
});

describe('ReasonLabelPipe', () => {
  it('http_status interpolates the status', async () => {
    const text = (await pipe()).transform(cell(StateEnum.Red, 1, { code: 'http_status', params: { status: 502 } }));
    expect(text).toContain('502');
  });

  it('tls_expiring interpolates the days', async () => {
    const text = (await pipe()).transform(cell(StateEnum.Orange, 1, { code: 'tls_expiring', params: { days: 12 } }));
    expect(text).toContain('12');
  });

  it('never_collected and open_items use the new wording', async () => {
    const p = await pipe();
    expect(p.transform(cell(StateEnum.Stale, 0, { code: 'never_collected', params: {} }))).toBe('Jamais collecté');
    expect(p.transform(cell(StateEnum.Orange, 3, { code: 'open_items', params: { n: 3 } }))).toBe('3 ouvert(s)');
  });

  it('open_items with a breakdown names what is open, zero parts left out', async () => {
    const p = await pipe();
    const params = { n: 7, prs: 2, issues: 0, dependabot: 0, code_scanning: 5, secrets: 0, main_ci: 0 };
    expect(p.transform(cell(StateEnum.Orange, 7, { code: 'open_items', params }))).toBe('5 alerte(s) de code · 2 PR');
  });

  it('open_items with an all-zero breakdown falls back to the plain count', async () => {
    const params = { n: 1, prs: 0, issues: 0 };
    expect((await pipe()).transform(cell(StateEnum.Orange, 1, { code: 'open_items', params }))).toBe('1 ouvert(s)');
  });

  it('unknown code on a red cell falls back to the red text with the count, never a raw key', async () => {
    const text = (await pipe()).transform(cell(StateEnum.Red, 2, { code: 'brand_new', params: {} }));
    expect(text).toContain('2');
    expect(text).not.toContain('reason.');
    expect(text).toBe(TestBed.inject(TranslocoService).translate('reason.fallback.red', { n: 2 }));
  });

  it('null reason on a green cell gives the green fallback', async () => {
    const text = (await pipe()).transform(cell(StateEnum.Green, 0, null));
    expect(text).toBe('OK');
  });

  it.each(['error', 'red', 'stale', 'orange', 'green', 'none'] as const)('fallback exists for %s', async (state) => {
    const text = (await pipe()).transform(cell(state as StateEnum, 3, null));
    expect(text).not.toContain('reason.');
    expect(text.length).toBeGreaterThan(0);
  });
});
