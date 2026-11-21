import { isNewer, newestFirst, safeUrl } from './site-helpers';

describe('site helpers', () => {
  it('safeUrl keeps only https URLs', () => {
    expect(safeUrl('https://github.com/x')).toBe('https://github.com/x');
    for (const bad of ['http://github.com', 'javascript:alert(1)', 'data:text/html,x', '//evil.test', '', null, undefined]) {
      expect(safeUrl(bad)).toBeNull();
    }
  });

  it('isNewer needs a previous visit and a later date', () => {
    const since = new Date('2026-11-20T00:00:00Z');
    expect(isNewer('2026-11-21T00:00:00Z', since)).toBe(true);
    expect(isNewer('2026-11-19T00:00:00Z', since)).toBe(false);
    expect(isNewer('2026-11-21T00:00:00Z', null)).toBe(false);
    expect(isNewer(null, since)).toBe(false);
    expect(isNewer('garbage', since)).toBe(false);
  });

  it('newestFirst sorts by descending date, undated last, without mutating', () => {
    const rows = [{ d: '2026-01-01T00:00:00Z' }, { d: null }, { d: '2026-03-01T00:00:00Z' }];
    expect(newestFirst(rows, (r) => r.d).map((r) => r.d)).toEqual(['2026-03-01T00:00:00Z', '2026-01-01T00:00:00Z', null]);
    expect(rows[0].d).toBe('2026-01-01T00:00:00Z');
  });
});
