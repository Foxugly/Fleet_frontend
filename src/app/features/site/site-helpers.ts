import { Cell } from '../../api';
import { stateRank } from '../../shared/fleet/state-order';

export type SourceKey = 'health' | 'github' | 'sentry' | 'deps';
export const SOURCES: readonly SourceKey[] = ['health', 'github', 'sentry', 'deps'];

/** Tab to open by default: the worst state, ties broken in source order. */
export function defaultTab(cells: Record<SourceKey, Cell>): SourceKey {
  let best = SOURCES[0];
  for (const key of SOURCES) {
    if (stateRank(cells[key].state) < stateRank(cells[best].state)) best = key;
  }
  return best;
}

/** Only https links from the GitHub/Sentry APIs are rendered as anchors. */
export function safeUrl(url: string | null | undefined): string | null {
  return typeof url === 'string' && url.startsWith('https://') ? url : null;
}

/** True when `iso` is later than the previous-visit snapshot (false without either). */
export function isNewer(iso: string | null | undefined, since: Date | null): boolean {
  if (!iso || !since) return false;
  const t = Date.parse(iso);
  return !Number.isNaN(t) && t > since.getTime();
}

/** Copy sorted by descending date; undated or unparsable rows go last. */
export function newestFirst<T>(rows: readonly T[], date: (row: T) => string | null | undefined): T[] {
  const time = (r: T) => {
    const t = Date.parse(date(r) ?? '');
    return Number.isNaN(t) ? -Infinity : t;
  };
  return [...rows].sort((a, b) => time(b) - time(a));
}
