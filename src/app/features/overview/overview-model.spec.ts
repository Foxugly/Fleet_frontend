import { Cell, Overview, OverviewSite } from '../../api';
import { BOX_KEY, OverviewEntry, bucket, buildEntries, summarize, worstState } from './overview-model';

const cell = (state: string, count = 0): Cell => ({
  state: state as Cell['state'],
  count,
  collected_at: null,
  error: '',
  reason: null,
});
const site = (slug: string, states: [string, string, string, string], deployed = true): OverviewSite => ({
  slug,
  deployed,
  cells: { health: cell(states[0]), github: cell(states[1]), sentry: cell(states[2]), deps: cell(states[3]) },
});
const overview = (box: string, sites: OverviewSite[]): Overview => ({
  generated_at: '2026-11-21T11:58:00Z',
  box: { box: cell(box) },
  sites,
});

describe('overview model', () => {
  it('re-exports the shared worstState', () => {
    expect(worstState([cell('green'), cell('red')])).toBe('red');
  });

  it('bucket: error/red to handle, orange/stale to watch, green ok, none nowhere', () => {
    expect(bucket('error' as never)).toBe('handle');
    expect(bucket('red' as never)).toBe('handle');
    expect(bucket('orange' as never)).toBe('watch');
    expect(bucket('stale' as never)).toBe('watch');
    expect(bucket('green' as never)).toBe('ok');
    expect(bucket('none' as never)).toBeNull();
  });

  it('buildEntries: box first, linking to /box, then sites with their worst state', () => {
    const entries = buildEntries(overview('orange', [site('poker', ['red', 'green', 'stale', 'none'], true)]));
    expect(entries.map((e) => e.key)).toEqual([BOX_KEY, 'poker']);
    expect(entries[0].link).toEqual(['/box']);
    expect(entries[0].deployed).toBe(true);
    expect(entries[0].worst).toBe('orange');
    expect(Object.keys(entries[0].cells)).toEqual(['box']);
    expect(entries[1]).toMatchObject({ key: 'poker', label: 'poker', link: ['/sites', 'poker'], deployed: true, worst: 'red' });
    expect(Object.keys(entries[1].cells)).toEqual(['health', 'github', 'sentry', 'deps']);
  });

  it('buildEntries sorts sites worst-first, keeps API order on ties, box always first', () => {
    const entries = buildEntries(
      overview('green', [
        site('a-green', ['green', 'green', 'green', 'none']),
        site('b-none', ['none', 'none', 'none', 'none'], false),
        site('c-orange', ['orange', 'green', 'green', 'green']),
        site('d-error', ['green', 'error', 'green', 'green']),
        site('e-green', ['green', 'green', 'green', 'green']),
        site('f-red', ['red', 'green', 'green', 'green']),
        site('g-stale', ['stale', 'green', 'green', 'green']),
        site('h-red', ['green', 'red', 'green', 'green']),
      ]),
    );
    expect(entries.map((e) => e.key)).toEqual([
      BOX_KEY,
      'd-error',
      'f-red',
      'h-red',
      'g-stale',
      'c-orange',
      'a-green',
      'e-green',
      'b-none',
    ]);
  });

  it('summarize counts buckets; the box is one entry; all-none lands in no bucket (Review Focus 1)', () => {
    const entries = buildEntries(
      overview('orange', [
        site('poker', ['red', 'green', 'green', 'green']),
        site('fabric', ['green', 'error', 'green', 'green']),
        site('ical', ['stale', 'green', 'green', 'green']),
        site('quiz', ['green', 'green', 'green', 'green']),
        site('ghost', ['none', 'none', 'none', 'none'], false),
      ]),
    );
    expect(summarize(entries)).toEqual({ handle: 2, watch: 2, ok: 1 });
    expect(entries.at(-1)!.key).toBe('ghost');
    expect(entries.at(-1)!.worst).toBe('none');
  });

  it('summarize of nothing is all zero', () => {
    expect(summarize([] as OverviewEntry[])).toEqual({ handle: 0, watch: 0, ok: 0 });
  });
});
