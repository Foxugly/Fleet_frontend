import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';

import { Cell, Overview } from '../../api';
import { Clock } from '../../shared/fleet/clock';
import { authTestProviders } from '../auth/auth-test-setup.testing';
import { OverviewComponent } from './overview.component';

@Component({ template: '' })
class Stub {}

const NOW = new Date('2026-11-21T12:00:00Z');
const cell = (state: string, count = 0): Cell => ({
  state: state as Cell['state'],
  count,
  collected_at: '2026-11-21T11:55:00Z',
  error: '',
});

const overview = (): Overview => ({
  generated_at: '2026-11-21T11:58:00Z',
  box: { box: cell('orange', 2) },
  sites: [
    { slug: 'poker', deployed: true, cells: { health: cell('red', 1), github: cell('green'), sentry: cell('stale'), deps: cell('none') } },
    { slug: 'chronos', deployed: false, cells: { health: cell('none'), github: cell('error'), sentry: cell('green'), deps: cell('orange', 3) } },
  ],
});

const isOverview = (r: { url: string }) => r.url.endsWith('/api/v1/overview/');

function mount(): { fixture: ComponentFixture<OverviewComponent>; http: HttpTestingController; el: HTMLElement } {
  TestBed.configureTestingModule({
    providers: [
      ...authTestProviders([
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

const states = (row: Element): string[] =>
  Array.from(row.querySelectorAll('.state-dot')).map((d) => d.className.match(/state-dot--(\w+)/)![1]);

describe('OverviewComponent', () => {
  beforeEach(() => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('shows skeleton rows while loading', async () => {
    const { fixture, el } = mount();
    await settle(fixture);
    expect(el.querySelectorAll('p-skeleton').length).toBeGreaterThan(0);
    expect(el.querySelector('app-state-dot')).toBeNull();
  });

  it('renders the box row first, then sites in API order, with a dot per cell', async () => {
    const { fixture, http, el } = mount();
    http.expectOne(isOverview).flush(overview());
    await settle(fixture);

    const rows = Array.from(el.querySelectorAll('tbody tr'));
    expect(rows.length).toBe(3);
    expect(rows[0].textContent).toContain('Box');
    expect(rows[0].querySelector('a')!.getAttribute('href')).toBe('/box');
    expect(rows[0].querySelector('td[colspan]')).not.toBeNull();
    expect(states(rows[0])).toEqual(['orange']);
    expect(rows[1].querySelector('a')!.textContent).toContain('poker');
    expect(rows[1].querySelector('a')!.getAttribute('href')).toBe('/sites/poker');
    expect(rows[2].querySelector('a')!.textContent).toContain('chronos');
    expect(states(rows[1])).toEqual(['red', 'green', 'stale', 'none']);
    expect(states(rows[2])).toEqual(['none', 'error', 'green', 'orange']);
  });

  it('has the five column headers, each source column with a refresh button', async () => {
    const { fixture, http, el } = mount();
    http.expectOne(isOverview).flush(overview());
    await settle(fixture);
    const heads = Array.from(el.querySelectorAll('thead th')).map((h) => h.textContent!.trim());
    expect(heads).toEqual(['Site', 'Santé', 'GitHub', 'Sentry', 'Dépendances']);
    expect(el.querySelectorAll('thead app-refresh-button').length).toBe(4);
    expect(el.querySelectorAll('tbody tr:first-child app-refresh-button').length).toBe(1);
    expect(el.querySelector('.table-scroll table')).not.toBeNull();
  });

  it('tags undeployed sites only', async () => {
    const { fixture, http, el } = mount();
    http.expectOne(isOverview).flush(overview());
    await settle(fixture);
    const rows = el.querySelectorAll('tbody tr');
    expect(rows[1].textContent).not.toContain('non déployé');
    expect(rows[2].textContent).toContain('non déployé');
  });

  it('shows the generated age and re-fetches from the global refresh button', async () => {
    const { fixture, http, el } = mount();
    http.expectOne(isOverview).flush(overview());
    await settle(fixture);
    expect(el.querySelector('.overview__generated')!.textContent).toContain('Généré il y a 2 min');
    el.querySelector<HTMLButtonElement>('.overview__reload button')!.click();
    http.expectOne(isOverview).flush(overview());
  });

  it('keeps the last data and shows an error when a later poll fails, then clears it (Review Focus 3)', async () => {
    vi.useFakeTimers();
    const { fixture, http, el } = mount();
    http.expectOne(isOverview).flush(overview());
    fixture.detectChanges();
    expect(el.querySelector('p-message')).toBeNull();

    vi.advanceTimersByTime(60_000);
    http.expectOne(isOverview).flush('boom', { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(el.querySelector('p-message')).not.toBeNull();
    expect(el.querySelectorAll('tbody tr').length).toBe(3);
    expect(el.querySelector('.state-dot--red')).not.toBeNull();
    expect(el.querySelector('.overview__generated')!.textContent).toContain('Généré');

    // polling continues
    vi.advanceTimersByTime(60_000);
    http.expectOne(isOverview).flush(overview());
    fixture.detectChanges();
    expect(el.querySelector('p-message')).toBeNull();
  });

  it('shows the error, not a blank page or skeleton, when the very first load fails', async () => {
    const { fixture, http, el } = mount();
    http.expectOne(isOverview).flush('boom', { status: 500, statusText: 'Server Error' });
    await settle(fixture);
    expect(el.querySelector('p-message')).not.toBeNull();
    expect(el.querySelector('p-skeleton')).toBeNull();
  });
});
