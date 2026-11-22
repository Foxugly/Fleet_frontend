import { ProgressEnum, UpdateGroup } from '../../../api';

export type UpdateSection = 'security' | 'major' | 'updates' | 'patch';
export const UPDATE_SECTIONS: readonly UpdateSection[] = ['security', 'major', 'updates', 'patch'];

/** The translate function the prompt is built with (Transloco's, in the UI language). */
export type Translate = (key: string, params?: object) => string;

/** Security first, whatever the kind; then major, patch, and minor/unknown as plain updates. */
export function sectionOf(g: UpdateGroup): UpdateSection {
  if (g.security) return 'security';
  if (g.kind === 'major') return 'major';
  if (g.kind === 'patch') return 'patch';
  return 'updates';
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

/** The members' current versions: one, or « min – max » when they differ; null for alert-only groups. */
export function versionRange(g: UpdateGroup): string | null {
  const currents = [...new Set(g.members.flatMap((m) => (m.current ? [m.current] : [])))].sort(natural);
  if (!currents.length) return null;
  return currents.length === 1 ? currents[0] : `${currents[0]} – ${currents[currents.length - 1]}`;
}

/** `Foxugly/x` (`requirements.txt`, `frontend/package-lock.json`), … — one entry per repo, locks joined. */
function targetsOf(g: UpdateGroup): string {
  const locks = new Map<string, string[]>();
  for (const m of g.members) {
    const list = locks.get(m.repo) ?? [];
    locks.set(m.repo, list);
    if (!m.lock) continue;
    // The API's lock id is "<repo>:<path>"; the prompt only needs the path.
    const path = m.lock.startsWith(`${m.repo}:`) ? m.lock.slice(m.repo.length + 1) : m.lock;
    if (!list.includes(path)) list.push(path);
  }
  return [...locks]
    .map(([repo, paths]) => (paths.length ? `\`${repo}\` (${paths.map((p) => `\`${p}\``).join(', ')})` : `\`${repo}\``))
    .join(', ');
}

/** The Claude Code prompt that applies the group fleet-wide; `branch` comes from the API, verbatim. */
export function buildPrompt(g: UpdateGroup, t: Translate): string {
  const targets = targetsOf(g);
  const pkg = g.package;
  const parts: string[] = [];

  const retryWith = g.progress === ProgressEnum.Retry ? g.blocked?.by.find((b) => b.newer) : undefined;
  if (retryWith) {
    const issues = (g.blocked?.issues ?? []).map((i) => `${i.repo}#${i.number}`).join(', ');
    parts.push(t('updates.prompt.retry', { blocker: retryWith.package, newer: retryWith.newer, issues }));
  }

  if (g.latest === null) {
    const severity = g.security?.max_severity ?? t('updates.prompt.severity_unknown');
    parts.push(t('updates.prompt.intro_security', { package: pkg, severity, targets }));
  } else {
    parts.push(t('updates.prompt.intro', { package: pkg, latest: g.latest, ecosystem: g.ecosystem ?? '', targets }));
  }
  parts.push(t('updates.prompt.steps', { branch: g.branch }));

  if (g.kind === 'major') {
    parts.push(t('updates.prompt.major'));
    if (pkg.startsWith('@angular/')) parts.push(t('updates.prompt.angular'));
  }
  // Issue convention read back by the API: the version is the word "security" for alert-only groups.
  parts.push(t('updates.prompt.failure', { package: pkg, latest: g.latest ?? 'security' }));
  return parts.join(' ');
}
