import { TestBed } from '@angular/core/testing';

import { LastVisitService } from './last-visit.service';

describe('LastVisitService', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const svc = () => TestBed.inject(LastVisitService);

  it('no previous visit: nothing is new', () => {
    expect(svc().lastVisit('box')).toBeNull();
    expect(svc().isNew('2026-11-21T10:00:00Z', 'box')).toBe(false);
  });

  it('markVisited stores under fleet.lastVisit.<scope>; only a later item is new', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
    svc().markVisited('site:quizonline');
    vi.useRealTimers();
    expect(localStorage.getItem('fleet.lastVisit.site:quizonline')).toBe('2026-11-21T10:00:00.000Z');
    expect(svc().lastVisit('site:quizonline')?.toISOString()).toBe('2026-11-21T10:00:00.000Z');
    expect(svc().isNew('2026-11-21T10:00:01Z', 'site:quizonline')).toBe(true);
    expect(svc().isNew('2026-11-21T09:59:59Z', 'site:quizonline')).toBe(false);
    expect(svc().isNew('2026-11-21T10:00:00Z', 'site:quizonline')).toBe(false);
  });

  it('scopes are independent', () => {
    svc().markVisited('box');
    expect(svc().lastVisit('site:x')).toBeNull();
  });

  it('isNew is false for a null or unparsable item date', () => {
    svc().markVisited('box');
    expect(svc().isNew(null, 'box')).toBe(false);
    expect(svc().isNew('garbage', 'box')).toBe(false);
  });

  it('a corrupt stored value reads as null', () => {
    localStorage.setItem('fleet.lastVisit.box', 'garbage');
    expect(svc().lastVisit('box')).toBeNull();
  });

  it('storage throwing: null and no crash', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(svc().lastVisit('box')).toBeNull();
    expect(() => svc().markVisited('box')).not.toThrow();
    expect(svc().isNew('2026-11-21T10:00:00Z', 'box')).toBe(false);
  });
});
