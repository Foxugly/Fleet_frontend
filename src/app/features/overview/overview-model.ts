import { Cell, Overview, StateEnum } from '../../api';
import { stateRank, worstState } from '../../shared/fleet/state-order';

export { worstState };

export type State = StateEnum;
export type Source = 'health' | 'github' | 'sentry' | 'deps' | 'box';
export type Bucket = 'handle' | 'watch' | 'ok';

/** Source display order, with each source's label key. */
export const SOURCES: readonly { key: Source; label: string }[] = [
  { key: 'health', label: 'overview.col.health' },
  { key: 'github', label: 'overview.col.github' },
  { key: 'sentry', label: 'overview.col.sentry' },
  { key: 'deps', label: 'overview.col.deps' },
  { key: 'box', label: 'overview.box' },
];

/** Key of the box entry. Its `label` is a Transloco key, a site's label is its slug. */
export const BOX_KEY = 'box';

export interface OverviewEntry {
  key: string;
  label: string;
  link: string[];
  deployed: boolean;
  cells: Partial<Record<Source, Cell>>;
  worst: State;
}

export function bucket(state: State): Bucket | null {
  switch (state) {
    case StateEnum.Error:
    case StateEnum.Red:
      return 'handle';
    case StateEnum.Orange:
    case StateEnum.Stale:
      return 'watch';
    case StateEnum.Green:
      return 'ok';
    default:
      return null;
  }
}

export function summarize(entries: readonly OverviewEntry[]): Record<Bucket, number> {
  const counts: Record<Bucket, number> = { handle: 0, watch: 0, ok: 0 };
  for (const e of entries) {
    const b = bucket(e.worst);
    if (b) counts[b]++;
  }
  return counts;
}

/** The box first, then the sites worst-first (stable: API order on ties). */
export function buildEntries(overview: Overview): OverviewEntry[] {
  const box: OverviewEntry = {
    key: BOX_KEY,
    label: 'overview.box',
    link: ['/box'],
    deployed: true,
    cells: { box: overview.box.box },
    worst: worstState([overview.box.box]),
  };
  const sites = overview.sites.map(
    (s): OverviewEntry => ({
      key: s.slug,
      label: s.slug,
      link: ['/sites', s.slug],
      deployed: s.deployed,
      cells: { ...s.cells },
      worst: worstState(Object.values(s.cells)),
    }),
  );
  sites.sort((a, b) => stateRank(a.worst) - stateRank(b.worst));
  return [box, ...sites];
}

/** The cell that sets the entry's worst state (first in source order). */
export function worstCell(entry: OverviewEntry): Cell | undefined {
  return SOURCES.map((s) => entry.cells[s.key]).find((c) => c?.state === entry.worst);
}

/** A source that can be filtered on: the four site sources (the box has its own entry). */
export type SiteSource = Exclude<Source, 'box'>;
export const SITE_SOURCES: readonly SiteSource[] = ['health', 'github', 'sentry', 'deps'];

export interface OverviewFilter {
  /** Case-insensitive substring of the app name. */
  q: string;
  bucket: Bucket | null;
  /** Keep only entries with a problem (to handle or to watch) on this source. */
  source: SiteSource | null;
}

export const NO_FILTER: OverviewFilter = { q: '', bucket: null, source: null };

export function isFiltering(f: OverviewFilter): boolean {
  return f.q.trim() !== '' || f.bucket !== null || f.source !== null;
}

/** Keeps the order of `entries`. The box matches the search on its key (`box`). */
export function filterEntries(entries: readonly OverviewEntry[], f: OverviewFilter): OverviewEntry[] {
  const q = f.q.trim().toLowerCase();
  return entries.filter((e) => {
    if (q && !e.key.toLowerCase().includes(q)) return false;
    if (f.bucket && bucket(e.worst) !== f.bucket) return false;
    if (f.source) {
      const c = e.cells[f.source];
      const b = c ? bucket(c.state) : null;
      if (b !== 'handle' && b !== 'watch') return false;
    }
    return true;
  });
}

/** Parses untrusted query-param values; anything unknown is ignored. */
export function parseFilter(params: { get(name: string): string | null }): OverviewFilter {
  const b = params.get('bucket');
  const s = params.get('source');
  return {
    q: (params.get('q') ?? '').slice(0, 100),
    bucket: b === 'handle' || b === 'watch' || b === 'ok' ? b : null,
    source: SITE_SOURCES.includes(s as SiteSource) ? (s as SiteSource) : null,
  };
}
