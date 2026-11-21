import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Cell, StateEnum } from '../../../api';
import { authTestProviders } from '../../../features/auth/auth-test-setup.testing';
import { Clock } from '../clock';
import { StateDotComponent } from './state-dot.component';

const NOW = new Date('2026-11-21T12:00:00Z');
const FIVE_MIN_AGO = '2026-11-21T11:55:00Z';

async function mount(cell: Cell, label = 'GitHub'): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [...authTestProviders(), { provide: Clock, useValue: { now: () => NOW } }],
  });
  const fixture: ComponentFixture<StateDotComponent> = TestBed.createComponent(StateDotComponent);
  fixture.componentRef.setInput('cell', cell);
  fixture.componentRef.setInput('label', label);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const cell = (state: StateEnum, extra: Partial<Cell> = {}): Cell => ({
  state,
  count: 0,
  collected_at: FIVE_MIN_AGO,
  error: '',
  ...extra,
});
const root = (el: HTMLElement) => el.querySelector<HTMLElement>('.state-dot')!;

describe('StateDotComponent', () => {
  it.each([
    [StateEnum.Green, 'Vert', 0],
    [StateEnum.Orange, 'Orange', 3],
    [StateEnum.Red, 'Rouge', 12],
  ])('%s: coloured dot, count, age, accessible name', async (state, stateLabel, count) => {
    const el = await mount(cell(state, { count }));
    expect(root(el).classList).toContain(`state-dot--${state}`);
    expect(el.querySelector('.state-dot__dot')).not.toBeNull();
    expect(el.textContent).toContain(String(count));
    expect(el.textContent).toContain('il y a 5 min');
    expect(root(el).getAttribute('aria-label')).toBe(`GitHub : ${stateLabel}, ${count}, il y a 5 min`);
  });

  it('stale is never green: clock icon, grey class, no dot', async () => {
    const el = await mount(cell(StateEnum.Stale, { collected_at: '2026-11-20T12:00:00Z' }));
    expect(root(el).classList).toContain('state-dot--stale');
    expect(root(el).classList).not.toContain('state-dot--green');
    expect(el.querySelector('.pi-clock')).not.toBeNull();
    expect(el.querySelector('.state-dot__dot')).toBeNull();
    expect(root(el).getAttribute('aria-label')).toContain('Périmé');
  });

  it('error: warning icon, error text in the aria-label (and tooltip)', async () => {
    const el = await mount(cell(StateEnum.Error, { error: 'HTTPError: 502' }));
    expect(root(el).classList).toContain('state-dot--error');
    expect(el.querySelector('.pi-exclamation-triangle')).not.toBeNull();
    expect(root(el).getAttribute('aria-label')).toContain('HTTPError: 502');
    expect(root(el).getAttribute('aria-label')).toContain('Erreur');
    expect(el.querySelector('.state-dot__dot')).toBeNull();
  });

  it('none: shows a dash, never a green dot', async () => {
    const el = await mount(cell(StateEnum.None, { collected_at: null }));
    expect(root(el).classList).toContain('state-dot--none');
    expect(el.querySelector('.state-dot__dot')).toBeNull();
    expect(el.textContent).toContain('—');
    expect(root(el).getAttribute('aria-label')).toBe('GitHub : Aucune donnée, 0, jamais collecté');
  });

  it('never collected (collected_at null, stale): jamais collecté, not NaN', async () => {
    const el = await mount(cell(StateEnum.Stale, { collected_at: null }));
    expect(el.textContent).toContain('jamais collecté');
    expect(el.textContent).not.toContain('NaN');
    expect(root(el).getAttribute('aria-label')).toContain('jamais collecté');
  });
});
