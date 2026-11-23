import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { Cell, Reason, StateEnum } from '../../api';
import { authTestProviders } from '../../features/auth/auth-test-setup.testing';
import { OverviewChipsComponent } from '../../features/overview/overview-chips.component';
import { OverviewEntry } from '../../features/overview/overview-model';
import { Clock } from './clock';
import { NotesLabelPipe, cellTip } from './reason-label.pipe';
import { StateDotComponent } from './state-dot/state-dot.component';

/** A deps cell whose only outdated item is held back by an installed package. */
const BLOCKED: Reason = {
  code: 'blocked_updates',
  params: { n: 1, package: 'typescript', latest: '7.0.2', by: '@angular/compiler-cli', version: '22.3.0' },
};
const BLOCKED_FR = '1 mise(s) à jour bloquée(s) : typescript 7.0.2 ← @angular/compiler-cli 22.3.0';

const cell = (over: Partial<Cell> = {}): Cell => ({
  state: StateEnum.Green,
  count: 0,
  collected_at: '2026-11-21T11:55:00Z',
  error: '',
  reason: null,
  notes: [],
  ...over,
});
const greenBlocked = cell({ reason: BLOCKED, notes: [BLOCKED] });
const orangeBlocked = cell({
  state: StateEnum.Orange,
  count: 2,
  reason: { code: 'outdated', params: { n: 2 } },
  notes: [BLOCKED],
});

async function setup(): Promise<void> {
  TestBed.configureTestingModule({
    providers: [...authTestProviders(), { provide: Clock, useValue: { now: () => new Date('2026-11-21T12:00:00Z') } }],
  });
  await new Promise<void>((resolve) => TestBed.inject(TranslocoService).load('fr').subscribe(() => resolve()));
}

async function render<T>(fixture: ComponentFixture<T>): Promise<HTMLElement> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('blocked updates (notes)', () => {
  it('NotesLabelPipe translates known notes, skips unknown codes', async () => {
    await setup();
    const pipe = TestBed.runInInjectionContext(() => new NotesLabelPipe());
    expect(pipe.transform(greenBlocked)).toBe(BLOCKED_FR);
    expect(pipe.transform(cell())).toBe('');
    expect(pipe.transform(cell({ notes: [{ code: 'brand_new', params: {} }] }))).toBe('');
  });

  it('cellTip: error first, notes appended only when the reason does not say them', () => {
    expect(cellTip(cell({ error: 'boom' }), 'r', 'n')).toBe('boom');
    expect(cellTip(cell(), 'same', 'same')).toBe('same');
    expect(cellTip(cell(), 'r', 'n')).toBe('r · n');
    expect(cellTip(cell(), 'r', '')).toBe('r');
  });

  it('state dot: a green cell with a blocked update shows a lock and says why', async () => {
    await setup();
    const fixture = TestBed.createComponent(StateDotComponent);
    fixture.componentRef.setInput('cell', greenBlocked);
    fixture.componentRef.setInput('label', 'Dépendances');
    const el = await render(fixture);
    expect(el.querySelector('.state-dot--green')).not.toBeNull();
    expect(el.querySelector('.state-dot__note.pi-lock')).not.toBeNull();
    expect(el.querySelector('.state-dot')!.getAttribute('aria-label')).toContain(BLOCKED_FR);
  });

  it('state dot: a plain green cell has no lock', async () => {
    await setup();
    const fixture = TestBed.createComponent(StateDotComponent);
    fixture.componentRef.setInput('cell', cell());
    fixture.componentRef.setInput('label', 'Dépendances');
    const el = await render(fixture);
    expect(el.querySelector('.state-dot__note')).toBeNull();
  });

  it('state dot: an orange cell names both the outdated count and the blocked note', async () => {
    await setup();
    const fixture = TestBed.createComponent(StateDotComponent);
    fixture.componentRef.setInput('cell', orangeBlocked);
    fixture.componentRef.setInput('label', 'Dépendances');
    const el = await render(fixture);
    const aria = el.querySelector('.state-dot')!.getAttribute('aria-label')!;
    expect(aria).toContain('2 obsolète(s)');
    expect(aria).toContain(BLOCKED_FR);
  });

  it('overview chip: green + lock + dotted modifier, the reason names the blocker', async () => {
    await setup();
    const entry: OverviewEntry = {
      key: 'fleet',
      label: 'fleet',
      link: ['/sites', 'fleet'],
      deployed: true,
      cells: { deps: greenBlocked, health: cell() },
      worst: StateEnum.Green,
    };
    const fixture = TestBed.createComponent(OverviewChipsComponent);
    fixture.componentRef.setInput('entry', entry);
    const el = await render(fixture);
    const chips = Array.from(el.querySelectorAll<HTMLElement>('.overview-chip'));
    const deps = chips.find((c) => c.classList.contains('overview-chip--noted'))!;
    expect(deps.classList).toContain('overview-chip--green');
    expect(deps.querySelector('.overview-chip__note.pi-lock')).not.toBeNull();
    expect(deps.textContent).toContain(BLOCKED_FR);
    expect(chips.filter((c) => c.querySelector('.overview-chip__note')).length).toBe(1);
  });
});
