import { Cell, StateEnum } from '../../api';
import { STATE_ORDER, worstState } from './state-order';

const cell = (state: StateEnum): Cell => ({ state, count: 0, collected_at: null, error: '', reason: null });

describe('state order', () => {
  it('is worst-first: error, red, stale, orange, green, none', () => {
    expect(STATE_ORDER).toEqual(['error', 'red', 'stale', 'orange', 'green', 'none']);
  });

  it('worstState picks the worst cell state in that order', () => {
    expect(worstState([cell(StateEnum.Green), cell(StateEnum.Orange)])).toBe('orange');
    expect(worstState([cell(StateEnum.Orange), cell(StateEnum.Stale)])).toBe('stale');
    expect(worstState([cell(StateEnum.Stale), cell(StateEnum.Red)])).toBe('red');
    expect(worstState([cell(StateEnum.Red), cell(StateEnum.Error)])).toBe('error');
    expect(worstState([cell(StateEnum.None), cell(StateEnum.Green)])).toBe('green');
  });

  it('all-none (or no cell) gives none', () => {
    expect(worstState([cell(StateEnum.None), cell(StateEnum.None)])).toBe('none');
    expect(worstState([])).toBe('none');
    expect(worstState([undefined])).toBe('none');
  });
});
