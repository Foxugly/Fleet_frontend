import { VIEW_STORAGE_KEY, readView, writeView } from './view-pref';

describe('view preference', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('uses the key fleet.overview.view', () => {
    expect(VIEW_STORAGE_KEY).toBe('fleet.overview.view');
  });

  it('defaults to list when nothing is stored', () => {
    expect(readView()).toBe('list');
  });

  it('falls back to list on a garbage value', () => {
    localStorage.setItem(VIEW_STORAGE_KEY, 'garbage');
    expect(readView()).toBe('list');
  });

  it('falls back to list, without throwing, when storage throws (Review Focus 2)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readView()).toBe('list');
    expect(() => writeView('mosaic')).not.toThrow();
  });

  it('reads back what was written', () => {
    writeView('mosaic');
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe('mosaic');
    expect(readView()).toBe('mosaic');
    writeView('list');
    expect(readView()).toBe('list');
  });
});
