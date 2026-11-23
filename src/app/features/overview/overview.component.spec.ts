import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MessageService } from '@openng/optimus-ui/api';

import { Cell, Overview } from '../../api';
import { Clock } from '../../shared/fleet/clock';
import { authTestProviders } from '../auth/auth-test-setup.testing';
import { OverviewComponent } from './overview.component';
import { group as updateGroup } from './updates/update-test-data.testing';
import { VIEW_STORAGE_KEY } from './view-pref';

const UPDATE_GROUP = updateGroup();

@Component({ template: '' })
class Stub {}

const NOW = new Date('2026-11-21T12:00:00Z');
const cell = (state: string, count = 0, reason: Cell['reason'] = null): Cell => ({
  state: state as Cell['state'],
  count,
  collected_at: '2026-11-21T11:55:00Z',
  error: '',
  reason,
  notes: [],
});
const allGreen = {
  health: cell('green'),
  github: cell('green'),
  sentry: cell('green'),
  deps: cell('green'),
};
const allNone = {
  health: cell('none'),
  github: cell('none'),
  sentry: cell('none'),
  deps: cell('none'),
};

// Deliberately not in worst-first order: the SPA sorts (stable) and puts the box first.
const overview = (): Overview => ({
  generated_at: '2026-11-21T11:58:00Z',
  box: { box: cell('orange', 2) },
  sites: [
    { slug: 'ghost', deployed: false, cells: allNone },
    {
      slug: 'poker',
      deployed: true,
      cells: {
        health: cell('red', 1, { code: 'http_status', params: { status: 502 } }),
        github: cell('green'),
        sentry: cell('stale'),
        deps: cell('none'),
      },
    },
    { slug: 'quiz', deployed: true, cells: allGreen },
    {
      slug: 'chronos',
      deployed: false,
      cells: {
        health: cell('none'),
        github: cell('error'),
        sentry: cell('green'),
        deps: cell('orange', 3),
      },
    },
    { slug: 'ical', deployed: true, cells: allGreen },
  ],
});

const isOverview = (r: { url: string }) => r.url.endsWith('/api/v1/overview/');
const isUpdates = (r: { url: string }) => r.url.endsWith('/api/v1/updates/');

interface Mounted {
  fixture: ComponentFixture<OverviewComponent>;
  http: HttpTestingController;
  el: HTMLElement;
}

function mount(): Mounted {
  TestBed.configureTestingModule({
    providers: [
      ...authTestProviders([
        { path: '', component: Stub },
        { path: 'box', component: Stub },
        { path: 'sites/:slug', component: Stub },
      ]),
      { provide: Clock, useValue: { now: () => NOW } },
      MessageService,
    ],
  });
  const fixture = TestBed.createComponent(OverviewComponent);
  fixture.detectChanges();
  return { fixture, http: TestBed.inject(HttpTestingController), el: fixture.nativeElement };
}

async function settle(fixture: ComponentFixture<OverviewComponent>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function loaded(): Promise<Mounted> {
  const m = mount();
  m.http.expectOne(isOverview).flush(overview());
  await settle(m.fixture);
  return m;
}

const rows = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('.overview-list__row'));
const tiles = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('.overview-mosaic__tile'));
const names = (items: HTMLElement[]) => items.map((r) => r.querySelector('a')!.textContent!.trim());
const viewButton = (el: HTMLElement, view: string) =>
  el.querySelector<HTMLButtonElement>(`.overview__view button[data-view="${view}"]`)!;

describe('OverviewComponent', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    // jsdom has no ResizeObserver; Optimus UI's tab list observes its scroll container.
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('shows skeleton rows while loading', async () => {
    const { fixture, el } = mount();
    await settle(fixture);
    expect(el.querySelectorAll('p-skeleton').length).toBeGreaterThan(0);
    expect(el.querySelector('.overview-list__row')).toBeNull();
  });

  it('shows the summary: the box counts as one, all-none counts nowhere', async () => {
    const { el } = await loaded();
    const summary = el.querySelector('.overview__summary')!;
    expect(summary.querySelector('.overview__count--handle')!.textContent).toContain('2 à traiter');
    expect(summary.querySelector('.overview__count--watch')!.textContent).toContain(
      '1 à surveiller',
    );
    expect(summary.querySelector('.overview__count--ok')!.textContent).toContain('2 OK');
  });

  it('list: box first linking to /box, worst-first, greens collapsed, all-none last and shown (Review Focus 1)', async () => {
    const { el } = await loaded();
    expect(viewButton(el, 'list').getAttribute('aria-pressed')).toBe('true');
    expect(viewButton(el, 'mosaic').getAttribute('aria-pressed')).toBe('false');
    expect(el.querySelector('app-overview-mosaic')).toBeNull();

    const visible = rows(el);
    expect(names(visible)).toEqual(['Box', 'chronos', 'poker', 'ghost']);
    expect(visible[0].querySelector('a')!.getAttribute('href')).toBe('/box');
    expect(visible[2].querySelector('a')!.getAttribute('href')).toBe('/sites/poker');
    const ghost = visible[3];
    expect(ghost.classList).toContain('overview-list__row--none');
    expect(ghost.textContent).toContain('non déployé');
    expect(visible[2].textContent).not.toContain('non déployé');
  });

  it('list: one chip per source, carrying the source and the reason label', async () => {
    const { el } = await loaded();
    const [box, , poker] = rows(el);
    expect(box.querySelectorAll('.overview-chip').length).toBe(1);
    expect(box.querySelector('.overview-chip--orange')!.textContent).toContain(
      "2 point(s) d'attention",
    );
    const chips = Array.from(poker.querySelectorAll('.overview-chip'));
    expect(chips.map((c) => c.className.match(/overview-chip--(\w+)/)![1])).toEqual([
      'red',
      'green',
      'stale',
      'none',
    ]);
    expect(chips[0].textContent).toContain('Santé');
    expect(chips[0].textContent).toContain('Répond 502');
  });

  it('list: the "+N" button reveals the green entries, before the all-none ones', async () => {
    const { fixture, el } = await loaded();
    const more = el.querySelector<HTMLButtonElement>('.overview-list__more button')!;
    expect(more.textContent).toContain('+2');
    expect(more.getAttribute('aria-expanded')).toBe('false');
    more.click();
    await settle(fixture);
    expect(names(rows(el))).toEqual(['Box', 'chronos', 'poker', 'quiz', 'ical', 'ghost']);
    expect(el.querySelector('.overview-list__more button')!.getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  it('the toggle switches to the mosaic and persists it', async () => {
    const { fixture, el } = await loaded();
    viewButton(el, 'mosaic').click();
    await settle(fixture);
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe('mosaic');
    expect(el.querySelector('app-overview-list')).toBeNull();
    expect(viewButton(el, 'mosaic').getAttribute('aria-pressed')).toBe('true');
    // The mosaic shows every entry, greens included.
    expect(names(tiles(el))).toEqual(['Box', 'chronos', 'poker', 'quiz', 'ical', 'ghost']);

    viewButton(el, 'list').click();
    await settle(fixture);
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe('list');
    expect(el.querySelector('app-overview-mosaic')).toBeNull();
  });

  it('opens on the stored view', async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, 'mosaic');
    const { el } = await loaded();
    expect(tiles(el).length).toBe(6);
  });

  it('falls back to the list when storage holds garbage (Review Focus 2)', async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, 'garbage');
    const { el } = await loaded();
    expect(rows(el).length).toBe(4);
  });

  it('falls back to the list, without crashing, when storage throws (Review Focus 2)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const { fixture, el } = await loaded();
    expect(rows(el).length).toBe(4);
    viewButton(el, 'mosaic').click();
    await settle(fixture);
    expect(tiles(el).length).toBe(6);
  });

  it('mosaic: border in the worst state, headline is the reason of the worst cell, a chip per source', async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, 'mosaic');
    const { el } = await loaded();
    const [box, chronos, poker, quiz, , ghost] = tiles(el);
    const headline = (t: HTMLElement) =>
      t.querySelector('.overview-mosaic__headline')!.textContent!.trim();
    expect(box.classList).toContain('overview-mosaic__tile--orange');
    expect(headline(box)).toBe("2 point(s) d'attention");
    expect(chronos.classList).toContain('overview-mosaic__tile--error');
    expect(headline(chronos)).toBe('Erreur de collecte');
    expect(chronos.textContent).toContain('non déployé');
    expect(headline(poker)).toBe('Répond 502');
    expect(poker.querySelectorAll('.overview-chip').length).toBe(4);
    expect(headline(quiz)).toBe('OK');
    expect(ghost.classList).toContain('overview-mosaic__tile--none');
    expect(headline(ghost)).toBe('Aucune donnée');
  });

  it('keeps a refresh button per source', async () => {
    const { el } = await loaded();
    expect(el.querySelectorAll('.overview__sources app-refresh-button').length).toBe(5);
  });

  it('shows the generated age and re-fetches from the global refresh button', async () => {
    const { http, el } = await loaded();
    expect(el.querySelector('.overview__generated')!.textContent).toContain('Généré il y a 2 min');
    el.querySelector<HTMLButtonElement>('.overview__reload button')!.click();
    http.expectOne(isOverview).flush(overview());
  });

  describe('tabs', () => {
    const panel = (el: HTMLElement, key: string) =>
      el.querySelector<HTMLElement>(`.overview__panel[data-panel="${key}"]`)!;
    const tabButton = (el: HTMLElement, key: string) =>
      el.querySelector<HTMLElement>(`p-tab[data-tab="${key}"]`)!;

    it('opens on « Apps »; the dependencies panel is rendered but hidden', async () => {
      const { http, el } = await loaded();
      expect(panel(el, 'apps').hidden).toBe(false);
      expect(panel(el, 'deps').hidden).toBe(true);
      expect(panel(el, 'deps').querySelector('app-shared-updates')).not.toBeNull();
      expect(panel(el, 'apps').querySelector('app-overview-list')).not.toBeNull();
      http.expectOne(isUpdates).flush({ generated_at: '2026-11-21T11:58:00Z', groups: [] });
    });

    it('?tab=deps opens « Dépendances »; the tab label carries the count', async () => {
      const m = await loaded();
      await TestBed.inject(Router).navigateByUrl('/?tab=deps');
      m.http
        .expectOne(isUpdates)
        .flush({ generated_at: '2026-11-21T11:58:00Z', groups: [UPDATE_GROUP] });
      await settle(m.fixture);
      expect(panel(m.el, 'deps').hidden).toBe(false);
      expect(panel(m.el, 'apps').hidden).toBe(true);
      expect(
        tabButton(m.el, 'deps').querySelector('.overview__tab-count')!.textContent!.trim(),
      ).toBe('1');
    });

    it('clicking a tab keeps it in the URL (replacing history) and keeps the filters', async () => {
      const m = await loaded();
      m.http.expectOne(isUpdates).flush({ generated_at: '2026-11-21T11:58:00Z', groups: [] });
      await TestBed.inject(Router).navigateByUrl('/?q=po');
      await settle(m.fixture);
      const nav = vi.spyOn(TestBed.inject(Router), 'navigate');
      tabButton(m.el, 'deps').click();
      await settle(m.fixture);
      expect(nav).toHaveBeenCalledWith(
        [],
        expect.objectContaining({
          queryParams: { tab: 'deps' },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        }),
      );
      expect(TestBed.inject(Router).url).toBe('/?q=po&tab=deps');
      tabButton(m.el, 'apps').click();
      await settle(m.fixture);
      expect(TestBed.inject(Router).url).toBe('/?q=po');
    });

    it('the reload button refreshes both tabs; a failing /updates/ leaves the apps untouched', async () => {
      const { fixture, http, el } = await loaded();
      http.expectOne(isUpdates).flush({ generated_at: '2026-11-21T11:58:00Z', groups: [] });
      el.querySelector<HTMLButtonElement>('.overview__reload button')!.click();
      http.expectOne(isOverview).flush(overview());
      http.expectOne(isUpdates).flush('boom', { status: 500, statusText: 'Server Error' });
      await settle(fixture);
      expect(el.querySelector('p-message')).toBeNull();
      expect(rows(el).length).toBe(4);
    });
  });

  it('keeps the last data, the error banner and the view when a later poll fails, then clears it (Review Focus 5)', async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, 'mosaic');
    vi.useFakeTimers();
    const { fixture, http, el } = mount();
    http.expectOne(isOverview).flush(overview());
    fixture.detectChanges();
    expect(el.querySelector('p-message')).toBeNull();
    expect(tiles(el).length).toBe(6);

    vi.advanceTimersByTime(60_000);
    http.expectOne(isOverview).flush('boom', { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(el.querySelector('p-message')).not.toBeNull();
    expect(tiles(el).length).toBe(6);
    expect(viewButton(el, 'mosaic').getAttribute('aria-pressed')).toBe('true');
    expect(el.querySelector('.overview__count--handle')!.textContent).toContain('2 à traiter');
    expect(el.querySelector('.overview__generated')!.textContent).toContain('Généré');

    // polling continues
    vi.advanceTimersByTime(60_000);
    http.expectOne(isOverview).flush(overview());
    fixture.detectChanges();
    expect(el.querySelector('p-message')).toBeNull();
    expect(tiles(el).length).toBe(6);
  });

  it('shows the error, not a blank page or skeleton, when the very first load fails', async () => {
    const { fixture, http, el } = mount();
    http.expectOne(isOverview).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(el.querySelector('p-message')).not.toBeNull();
    expect(el.querySelector('p-skeleton')).toBeNull();
  });

  describe('search and filters', () => {
    const bucketButton = (el: HTMLElement, b: string) =>
      el.querySelector<HTMLButtonElement>(`.overview__count[data-bucket="${b}"]`)!;
    const search = (el: HTMLElement) =>
      el.querySelector<HTMLInputElement>('.overview__search-input')!;
    const go = async (m: Mounted, url: string) => {
      await TestBed.inject(Router).navigateByUrl(url);
      await settle(m.fixture);
    };

    it('typing in the search box filters by name and keeps it in the URL', async () => {
      const m = await loaded();
      const input = search(m.el);
      input.value = 'PO';
      input.dispatchEvent(new Event('input'));
      await settle(m.fixture);
      expect(names(rows(m.el))).toEqual(['poker']);
      expect(TestBed.inject(Router).url).toBe('/?q=PO');
    });

    it('a summary bucket toggles a filter; matching greens are shown, not collapsed', async () => {
      const m = await loaded();
      bucketButton(m.el, 'ok').click();
      await settle(m.fixture);
      expect(bucketButton(m.el, 'ok').getAttribute('aria-pressed')).toBe('true');
      expect(names(rows(m.el))).toEqual(['quiz', 'ical']);
      expect(m.el.querySelector('.overview-list__more')).toBeNull();

      bucketButton(m.el, 'ok').click();
      await settle(m.fixture);
      expect(bucketButton(m.el, 'ok').getAttribute('aria-pressed')).toBe('false');
      expect(names(rows(m.el))).toEqual(['Box', 'chronos', 'poker', 'ghost']);
    });

    it('the source filter keeps the apps with a problem on that source (from the URL)', async () => {
      const m = await loaded();
      await go(m, '/?source=deps');
      expect(names(rows(m.el))).toEqual(['chronos']);
    });

    it('filters also apply to the mosaic', async () => {
      const m = await loaded();
      viewButton(m.el, 'mosaic').click();
      await go(m, '/?bucket=handle');
      expect(names(tiles(m.el))).toEqual(['chronos', 'poker']);
    });

    it('no match shows a message, and "clear filters" brings everything back', async () => {
      const m = await loaded();
      await go(m, '/?q=zzz&source=sentry');
      expect(rows(m.el)).toEqual([]);
      expect(m.el.querySelector('.overview__empty')!.textContent).toContain(
        'Aucune app ne correspond',
      );
      m.el.querySelector<HTMLButtonElement>('.overview__clear button')!.click();
      await settle(m.fixture);
      expect(TestBed.inject(Router).url).toBe('/');
      expect(names(rows(m.el))).toEqual(['Box', 'chronos', 'poker', 'ghost']);
      expect(m.el.querySelector('.overview__clear')).toBeNull();
    });

    it('announces the result count in a live region, and the active bucket is not colour-only', async () => {
      const m = await loaded();
      const live = () => m.el.querySelector('.overview__live')!;
      expect(live().getAttribute('role')).toBe('status');
      expect(live().textContent!.trim()).toBe('');
      bucketButton(m.el, 'handle').click();
      await settle(m.fixture);
      expect(live().textContent).toContain('2 app(s) affichée(s)');
      expect(bucketButton(m.el, 'handle').querySelector('.pi-check')).not.toBeNull();
      expect(bucketButton(m.el, 'watch').querySelector('.pi-check')).toBeNull();
      await go(m, '/?q=zzz');
      expect(live().textContent).toContain('Aucune app ne correspond');
    });

    it('Escape or an emptied search box removes the search from the URL', async () => {
      const m = await loaded();
      await go(m, '/?q=po');
      const input = search(m.el);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await settle(m.fixture);
      expect(TestBed.inject(Router).url).toBe('/');
      await go(m, '/?q=po');
      input.value = '';
      input.dispatchEvent(new Event('input'));
      await settle(m.fixture);
      expect(TestBed.inject(Router).url).toBe('/');
    });

    it('keeps unrelated query params', async () => {
      const m = await loaded();
      await go(m, '/?foo=1');
      bucketButton(m.el, 'watch').click();
      await settle(m.fixture);
      expect(TestBed.inject(Router).url).toBe('/?foo=1&bucket=watch');
    });

    it('the empty state has its own "clear filters" button', async () => {
      const m = await loaded();
      await go(m, '/?q=zzz');
      m.el.querySelector<HTMLButtonElement>('.overview__empty-clear button')!.click();
      await settle(m.fixture);
      expect(TestBed.inject(Router).url).toBe('/');
    });

    it('ignores unknown filter values in the URL', async () => {
      const m = await loaded();
      await go(m, '/?bucket=nope&source=box');
      expect(names(rows(m.el))).toEqual(['Box', 'chronos', 'poker', 'ghost']);
      expect(m.el.querySelector('.overview__clear')).toBeNull();
    });
  });
});
