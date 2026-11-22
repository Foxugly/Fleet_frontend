import { Cell, StateEnum } from '../../api';

/** Cell state, worst first. Same order as the backend's `STATE_ORDER`. */
export const STATE_ORDER: readonly StateEnum[] = [
  StateEnum.Error,
  StateEnum.Red,
  StateEnum.Stale,
  StateEnum.Orange,
  StateEnum.Green,
  StateEnum.None,
];

/** 0 = worst. */
export function stateRank(state: StateEnum): number {
  return STATE_ORDER.indexOf(state);
}

/** Worst state among the cells; no cell, or only `none` cells, gives `none`. */
export function worstState(cells: readonly (Cell | undefined)[]): StateEnum {
  let worst: StateEnum = StateEnum.None;
  for (const c of cells) {
    if (c && stateRank(c.state) < stateRank(worst)) worst = c.state;
  }
  return worst;
}
