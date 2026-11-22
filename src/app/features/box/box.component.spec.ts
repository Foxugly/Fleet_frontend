import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';

import { Box, Cell } from '../../api';
import { LastVisitService } from '../../core/last-visit/last-visit.service';
import { Clock } from '../../shared/fleet/clock';
import { BoxData } from '../../shared/fleet/source-data';
import { authTestProviders } from '../auth/auth-test-setup.testing';
import { BoxComponent } from './box.component';

const NOW = new Date('2026-11-21T12:00:00Z');

const data = (over: Partial<BoxData> = {}): BoxData => ({
  apt: [
    { package: 'vim', version: '9.1-2', origin: 'noble-updates', security: false },
    { package: 'openssl', version: '3.0.13-1', origin: 'noble-security', security: true, from_version: '3.0.13-0' },
    { package: 'curl', version: '8.5-1', origin: 'noble-updates', security: false },
  ],
  reboot_required: false,
  reboot_pkgs: [],
  failed_units: [],
  disk: { mount: '/', used_pct: 42 },
  memory: { total_mb: 8000, available_mb: 3000 },
  ...over,
});

const box = (d: BoxData | null, extra: Partial<Box> = {}): Box => ({
  cell: { state: 'green' as Cell['state'], count: 0, collected_at: '2026-11-21T11:55:00Z', error: '', reason: null },
  data: d,
  collected_at: d ? '2026-11-21T11:50:00Z' : null,
  ok: d ? true : null,
  error: '',
  ...extra,
});

const isBox = (r: { url: string }) => r.url.endsWith('/api/v1/box/');

async function setup() {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      ...authTestProviders(),
      provideRouter([{ path: 'box', component: BoxComponent }]),
      { provide: Clock, useValue: { now: () => NOW } },
      MessageService,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/box', BoxComponent);
  return {
    harness,
    http: TestBed.inject(HttpTestingController),
    el: harness.routeNativeElement as HTMLElement,
    mark: vi.spyOn(TestBed.inject(LastVisitService), 'markVisited'),
  };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function loaded(b: Box | 'error') {
  const s = await setup();
  if (b === 'error') s.http.expectOne(isBox).flush('boom', { status: 500, statusText: 'Server Error' });
  else s.http.expectOne(isBox).flush(b);
  await settle(s.harness.fixture);
  return s;
}

describe('BoxComponent', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows skeletons while loading', async () => {
    const { el, harness } = await setup();
    await settle(harness.fixture);
    expect(el.querySelectorAll('p-skeleton').length).toBeGreaterThan(0);
  });

  it('lists security packages first, with the translated red tag', async () => {
    const { el } = await loaded(box(data()));
    const rows = Array.from(el.querySelectorAll('.apt-table tbody tr'));
    expect(rows.map((r) => r.querySelector('td')!.textContent!.trim())).toEqual(['openssl', 'vim', 'curl']);
    expect(rows[0].querySelector('.sev-security')).not.toBeNull();
    expect(rows[0].textContent).toContain('Sécurité');
    expect(rows[1].querySelector('.sev-security')).toBeNull();
    expect(el.querySelector('h1')!.textContent).toContain('Box');
  });

  it('labels the age line as the last successful collection', async () => {
    const { el } = await loaded(box(data()));
    expect(el.querySelector('.box__age')!.textContent!.trim()).toBe('dernière collecte réussie il y a 10 min');
  });

  it('keeps the package name and the security tag on one line (only the version wraps)', async () => {
    const { el } = await loaded(box(data()));
    const cells = el.querySelectorAll('.apt-table tbody tr:first-child td');
    expect(cells[0].classList).toContain('apt-nowrap');
    expect(cells[3].classList).toContain('apt-nowrap');
    expect(cells[1].classList).not.toContain('apt-nowrap');
  });

  it('hides the reboot block when no reboot is required', async () => {
    const { el } = await loaded(box(data()));
    expect(el.querySelector('.box__reboot')).toBeNull();
  });

  it('shows the reboot block with the packages when a reboot is required', async () => {
    const { el } = await loaded(box(data({ reboot_required: true, reboot_pkgs: ['linux-image-6.8'] })));
    expect(el.querySelector('.box__reboot')!.textContent).toContain('linux-image-6.8');
  });

  it('lists failed units in red', async () => {
    const { el } = await loaded(box(data({ failed_units: ['nginx.service'] })));
    expect(el.querySelector('.box__failed .unit-failed')!.textContent).toContain('nginx.service');
  });

  it('says there is no failed unit otherwise', async () => {
    const { el } = await loaded(box(data()));
    expect(el.querySelector('.unit-failed')).toBeNull();
    expect(el.querySelector('.box__failed')!.textContent).toContain('Aucune');
  });

  it('flags the disk at 90 %', async () => {
    const { el } = await loaded(box(data({ disk: { mount: '/', used_pct: 90 } })));
    expect(el.querySelector('p-progressbar.disk--critical')).not.toBeNull();
  });

  it('does not flag the disk at 89 %', async () => {
    const { el } = await loaded(box(data({ disk: { mount: '/', used_pct: 89 } })));
    expect(el.querySelector('p-progressbar')).not.toBeNull();
    expect(el.querySelector('.disk--critical')).toBeNull();
  });

  it('shows memory available / total via the translated unit', async () => {
    const { el } = await loaded(box(data()));
    const mem = el.querySelector('.box__memory')!.textContent!;
    expect(mem).toContain('3000');
    expect(mem).toContain('8000');
    expect(mem).toContain('Mo');
  });

  it('ok=false shows the error and still the last good data', async () => {
    const { el } = await loaded(box(data(), { ok: false, error: 'ssh timeout' }));
    expect(el.querySelector('p-message')!.textContent).toContain('ssh timeout');
    expect(el.textContent).toContain('dernière collecte réussie');
    expect(el.textContent).toContain('openssl');
  });

  it('never collected says so instead of rendering blocks', async () => {
    const { el } = await loaded(box(null));
    expect(el.textContent).toContain('jamais collecté');
    expect(el.querySelector('.apt-table')).toBeNull();
  });

  it('an HTTP failure shows a p-message error and no skeleton', async () => {
    const { el } = await loaded('error');
    expect(el.querySelector('p-message')).not.toBeNull();
    expect(el.querySelector('p-skeleton')).toBeNull();
  });

  it('marks the box visited on destroy when data was loaded', async () => {
    const { harness, mark } = await loaded(box(data()));
    expect(mark).not.toHaveBeenCalled();
    harness.fixture.destroy();
    expect(mark).toHaveBeenCalledWith('box');
  });

  it('does not mark the visit after a failed load', async () => {
    const { harness, mark } = await loaded('error');
    harness.fixture.destroy();
    expect(mark).not.toHaveBeenCalled();
  });

  it('does not mark the visit when nothing was ever collected', async () => {
    const { harness, mark } = await loaded(box(null));
    harness.fixture.destroy();
    expect(mark).not.toHaveBeenCalled();
  });
});
