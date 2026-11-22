import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';

import { Cell, SiteDetail } from '../../api';
import { LastVisitService } from '../../core/last-visit/last-visit.service';
import { Clock } from '../../shared/fleet/clock';
import { authTestProviders } from '../auth/auth-test-setup.testing';
import { SiteDetailComponent } from './site-detail.component';

@Component({ template: '' })
class Stub {}

const NOW = new Date('2026-11-21T12:00:00Z');
const cell = (state: string, count = 0): Cell => ({ state: state as Cell['state'], count, collected_at: '2026-11-21T11:55:00Z', error: '', reason: null });
const subj = (data: unknown, extra: Partial<{ ok: boolean | null; error: string; collected_at: string | null }> = {}) => ({
  data,
  collected_at: '2026-11-21T11:50:00Z',
  ok: true,
  error: '',
  ...extra,
});

const detail = (slug = 'poker', archived = false): SiteDetail => ({
  slug,
  archived,
  repos: ['Poker_server'],
  vhosts: ['poker.foxugly.com'],
  deployed: true,
  actions_allowed: false,
  sources: {
    health: {
      cell: cell('green'),
      items: { 'poker.foxugly.com': subj({ status: 200, latency_ms: 80, error: '', tls_days_left: 40 }) },
    },
    github: {
      cell: cell('orange', 2),
      items: {
        'Foxugly/Poker_server': subj({
          prs: [
            { number: 1, title: 'Old PR', url: 'https://github.com/o/r/pull/1', author: 'ann', is_dependabot: false, draft: false, checks: 'success', merge_state: 'clean', created_at: '2026-11-01T00:00:00Z' },
            { number: 2, title: 'New PR', url: 'https://github.com/o/r/pull/2', author: 'bob', is_dependabot: false, draft: false, checks: 'pending', merge_state: 'clean', created_at: '2026-11-21T00:00:00Z' },
          ],
          issues: [],
          dependabot_alerts: [],
          code_scanning: [],
          secret_scanning: [],
          main_run: null,
        }),
      },
    },
    sentry: { cell: cell('green'), items: { 'poker-backend': subj({ unresolved: 0, new_24h: 0, issues: [] }) } },
    deps: { cell: cell('none'), items: { 'requirements.txt': subj({ ecosystem: 'python', checked: 5, outdated: [] }) } },
  },
});

const isSite = (slug: string) => (r: { url: string }) => r.url.endsWith(`/api/v1/sites/${slug}/`);

async function setup(slug = 'poker', visit: string | null = null, query = '') {
  localStorage.clear();
  if (visit) localStorage.setItem('fleet.lastVisit.site:' + slug, visit);
  TestBed.configureTestingModule({
    providers: [
      ...authTestProviders(),
      provideRouter([
        { path: 'sites/:slug', component: SiteDetailComponent },
        { path: '', component: Stub },
      ]),
      { provide: Clock, useValue: { now: () => NOW } },
      MessageService,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/sites/' + slug + query, SiteDetailComponent);
  return {
    harness,
    http: TestBed.inject(HttpTestingController),
    router: TestBed.inject(Router),
    el: harness.routeNativeElement as HTMLElement,
  };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('SiteDetailComponent', () => {
  beforeEach(() => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    // jsdom has no ResizeObserver; PrimeNG's tab list observes its scroll container.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows skeletons while loading', async () => {
    const { el, harness } = await setup();
    await settle(harness.fixture);
    expect(el.querySelectorAll('p-skeleton').length).toBeGreaterThan(0);
  });

  it('renders one tab per source with the slug as title, back action and deploy tags', async () => {
    const { http, harness, el } = await setup('poker', null, '?tab=health');
    http.expectOne(isSite('poker')).flush(detail());
    await settle(harness.fixture);
    expect(el.querySelector('h1')!.textContent).toContain('poker');
    expect(el.querySelectorAll('p-tab').length).toBe(4);
    expect(el.querySelectorAll('p-tab app-state-dot').length).toBe(4);
    expect(el.querySelectorAll('app-refresh-button').length).toBe(1);
    expect(el.textContent).toContain('poker.foxugly.com');
    expect(el.textContent).toContain('Retour');
    expect(el.textContent).toContain('Déployé');
  });

  it('shows « Modifier », linking to the inventory form of this app', async () => {
    const { http, harness, el } = await setup();
    http.expectOne(isSite('poker')).flush(detail());
    await settle(harness.fixture);
    const edit = el.querySelector<HTMLAnchorElement>('a[href="/apps/poker/edit"]');
    expect(edit).not.toBeNull();
    expect(edit!.textContent).toContain('Modifier');
    expect(el.textContent).not.toContain('Archivée');
  });

  it('an archived app gets an « Archivée » tag', async () => {
    const { http, harness, el } = await setup();
    http.expectOne(isSite('poker')).flush(detail('poker', true));
    await settle(harness.fixture);
    expect(el.querySelector('.site__tags')!.textContent).toContain('Archivée');
  });

  describe('tabs', () => {
    const activeSource = (el: HTMLElement) => el.querySelector('p-tab.p-tab-active')?.getAttribute('data-source');

    it('?tab=sentry activates the Sentry panel', async () => {
      const { http, harness, el } = await setup('poker', null, '?tab=sentry');
      http.expectOne(isSite('poker')).flush(detail());
      await settle(harness.fixture);
      expect(activeSource(el)).toBe('sentry');
      expect(el.textContent).toContain('poker-backend');
      expect(el.textContent).not.toContain('Foxugly/Poker_server');
    });

    it.each(['?tab=garbage', ''])('%j opens the worst tab (github is orange)', async (q) => {
      const { http, harness, el } = await setup('poker', null, q);
      http.expectOne(isSite('poker')).flush(detail());
      await settle(harness.fixture);
      expect(activeSource(el)).toBe('github');
      expect(el.textContent).toContain('Foxugly/Poker_server');
    });

    it('scrolls the active tab into view (the tab list scrolls on a phone)', async () => {
      const scroll = vi.fn();
      const proto = HTMLElement.prototype as { scrollIntoView?: unknown };
      const original = proto.scrollIntoView;
      proto.scrollIntoView = function (this: HTMLElement, ...args: unknown[]) {
        scroll(this.getAttribute('data-source'), ...args);
      };
      try {
        const { http, harness } = await setup('poker', null, '?tab=deps');
        http.expectOne(isSite('poker')).flush(detail());
        await settle(harness.fixture);
        await new Promise((r) => setTimeout(r));
        expect(scroll).toHaveBeenCalledWith('deps', { block: 'nearest', inline: 'nearest' });
      } finally {
        proto.scrollIntoView = original;
      }
    });

    it('clicking a tab navigates with the tab query param, replacing history', async () => {
      const { http, harness, el, router } = await setup();
      http.expectOne(isSite('poker')).flush(detail());
      await settle(harness.fixture);
      const nav = vi.spyOn(router, 'navigate');
      (el.querySelector('p-tab[data-source="deps"]') as HTMLElement).click();
      expect(nav).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { tab: 'deps' }, queryParamsHandling: 'merge', replaceUrl: true }));
      await settle(harness.fixture);
      expect(activeSource(el)).toBe('deps');
    });

    it('each tab label shows the source name and a state dot with its count', async () => {
      const { http, harness, el } = await setup();
      http.expectOne(isSite('poker')).flush(detail());
      await settle(harness.fixture);
      const github = el.querySelector('p-tab[data-source="github"]')!;
      expect(github.textContent).toContain('GitHub');
      expect(github.querySelector('app-state-dot')).not.toBeNull();
      expect(github.querySelector('app-state-dot')!.textContent).toContain('2');
    });
  });

  it('a subject with ok=false shows the warning and still the last good data', async () => {
    const { http, harness, el } = await setup('poker', null, '?tab=health');
    const d = detail();
    d.sources.health.items['poker.foxugly.com'] = subj({ status: 200, latency_ms: 80, error: '', tls_days_left: 40 }, { ok: false, error: 'GitHub 502' });
    http.expectOne(isSite('poker')).flush(d);
    await settle(harness.fixture);
    expect(el.querySelector('p-tabpanel p-message')!.textContent).toContain('GitHub 502');
    expect(el.textContent).toContain('dernière collecte réussie');
    expect(el.textContent).toContain('80');
  });

  it('a subject without any good snapshot says never collected and does not crash', async () => {
    const { http, harness, el } = await setup('poker', null, '?tab=sentry');
    const d = detail();
    d.sources.sentry.items['poker-backend'] = subj(null, { collected_at: null, ok: null });
    http.expectOne(isSite('poker')).flush(d);
    await settle(harness.fixture);
    expect(el.textContent).toContain('jamais collecté');
  });

  it('tags items newer than the stored visit only', async () => {
    const { http, harness, el } = await setup('poker', '2026-11-20T00:00:00Z');
    http.expectOne(isSite('poker')).flush(detail());
    await settle(harness.fixture);
    const rows = el.querySelectorAll('.pr-row');
    expect(rows.length).toBe(2);
    expect(rows[0].querySelector('.tag-new')).not.toBeNull();
    expect(rows[1].querySelector('.tag-new')).toBeNull();
  });

  it('keeps markers while reading and marks the visit only on destroy', async () => {
    const { http, harness, el } = await setup('poker', '2026-11-20T00:00:00Z');
    const mark = vi.spyOn(TestBed.inject(LastVisitService), 'markVisited');
    http.expectOne(isSite('poker')).flush(detail());
    await settle(harness.fixture);
    expect(mark).not.toHaveBeenCalled();
    expect(el.querySelector('.tag-new')).not.toBeNull();
    harness.fixture.destroy();
    expect(mark).toHaveBeenCalledWith('site:poker');
  });

  it('does not mark the visit when the load failed', async () => {
    const { http, harness } = await setup();
    const mark = vi.spyOn(TestBed.inject(LastVisitService), 'markVisited');
    http.expectOne(isSite('poker')).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(harness.fixture);
    harness.fixture.destroy();
    expect(mark).not.toHaveBeenCalled();
  });

  it('does not mark the visit of an unknown slug (404)', async () => {
    const { http, harness } = await setup('nope');
    const mark = vi.spyOn(TestBed.inject(LastVisitService), 'markVisited');
    http.expectOne(isSite('nope')).flush({ detail: 'x' }, { status: 404, statusText: 'Not Found' });
    await settle(harness.fixture);
    harness.fixture.destroy();
    expect(mark).not.toHaveBeenCalled();
  });

  it('does not mark the visit when leaving before the data arrived', async () => {
    const { http, router } = await setup('poker');
    const mark = vi.spyOn(TestBed.inject(LastVisitService), 'markVisited');
    const pending = http.expectOne(isSite('poker'));
    await router.navigateByUrl('/sites/other');
    expect(mark).not.toHaveBeenCalled();
    expect(pending.cancelled).toBe(true);
    http.expectOne(isSite('other'));
  });

  it('unknown slug (404) shows « Site inconnu » with a back link', async () => {
    const { http, harness, el } = await setup('nope');
    http.expectOne(isSite('nope')).flush({ detail: 'x' }, { status: 404, statusText: 'Not Found' });
    await settle(harness.fixture);
    const empty = el.querySelector('app-empty-state')!;
    expect(empty.textContent).toContain('Site inconnu');
    expect(empty.textContent).toContain('Retour');
    expect(el.querySelector('p-tabs')).toBeNull();
  });

  it('other errors show a p-message, not the empty state', async () => {
    const { http, harness, el } = await setup();
    http.expectOne(isSite('poker')).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(harness.fixture);
    expect(el.querySelector('app-empty-state')).toBeNull();
    expect(el.querySelector('p-message')).not.toBeNull();
  });

  it('keeps the loaded data when a reload fails', async () => {
    const { http, harness, el } = await setup();
    http.expectOne(isSite('poker')).flush(detail());
    await settle(harness.fixture);
    (el.querySelector('.site__reload button') as HTMLButtonElement).click();
    http.expectOne(isSite('poker')).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(harness.fixture);
    expect(el.querySelectorAll('p-tab').length).toBe(4);
    expect(el.querySelector('p-message')).not.toBeNull();
  });

  it('on slug change marks the old slug visited, snapshots the new one and reloads', async () => {
    const { http, harness, el, router } = await setup('poker', '2026-11-20T00:00:00Z');
    localStorage.setItem('fleet.lastVisit.site:other', '2026-11-25T00:00:00Z');
    const mark = vi.spyOn(TestBed.inject(LastVisitService), 'markVisited');
    http.expectOne(isSite('poker')).flush(detail());
    await settle(harness.fixture);
    expect(el.querySelector('.tag-new')).not.toBeNull();

    await router.navigateByUrl('/sites/other');
    expect(mark).toHaveBeenCalledWith('site:poker');
    http.expectOne(isSite('other')).flush(detail('other'));
    await settle(harness.fixture);
    expect(el.querySelector('h1')!.textContent).toContain('other');
    // 'other' was visited after every item: nothing is new for it.
    expect(el.querySelector('.tag-new')).toBeNull();
  });
});
