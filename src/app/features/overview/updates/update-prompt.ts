import { BlockerKindEnum, ProgressEnum, UpdateGroup } from '../../../api';

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

// Everything below comes from registries and GitHub through the API: it is checked before it
// enters a prompt that Claude Code will execute.
const PACKAGE_RE = /^[A-Za-z0-9@][A-Za-z0-9._@/+-]{0,213}$/;
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._+!-]{0,63}$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const LOCK_PATH_RE = /^[A-Za-z0-9._/-]{1,200}$/;
const ECOSYSTEMS: readonly (string | null)[] = ['python', 'npm', null];
export const SEVERITIES: readonly string[] = ['critical', 'high', 'medium', 'low'];

/** The API's lock id is "<repo>:<path>"; the prompt only needs the path. */
const lockPath = (repo: string, lock: string) => (lock.startsWith(`${repo}:`) ? lock.slice(repo.length + 1) : lock);

const safeLockPath = (path: string) =>
  LOCK_PATH_RE.test(path) && !path.startsWith('/') && !path.split('/').includes('..');

/** True when every API value that reaches the prompt has the expected shape. */
export function isPromptSafe(g: UpdateGroup): boolean {
  const version = (v: string | null) => v === null || VERSION_RE.test(v);
  return (
    PACKAGE_RE.test(g.package) &&
    version(g.latest) &&
    ECOSYSTEMS.includes(g.ecosystem) &&
    // The branch is recomputed, never trusted as is.
    g.branch === `deps/${g.package}-${g.latest ?? 'security'}` &&
    (g.security?.max_severity == null || SEVERITIES.includes(g.security.max_severity)) &&
    g.members.every((m) => REPO_RE.test(m.repo) && (m.lock === null || safeLockPath(lockPath(m.repo, m.lock)))) &&
    (g.blocked === null ||
      (g.blocked.issues.every((i) => REPO_RE.test(i.repo) && Number.isInteger(i.number)) &&
        g.blocked.by.every(
          (b) =>
            PACKAGE_RE.test(b.package) &&
            // A hold names a file, not a release: its version is empty.
            (VERSION_RE.test(b.version) || (b.kind === BlockerKindEnum.Hold && b.version === '')) &&
            version(b.newer),
        )))
  );
}

/** `Foxugly/x` (`requirements.txt`, `frontend/package-lock.json`), … — one entry per repo, locks joined. */
function targetsOf(g: UpdateGroup): string {
  const locks = new Map<string, string[]>();
  for (const m of g.members) {
    const list = locks.get(m.repo) ?? [];
    locks.set(m.repo, list);
    if (!m.lock) continue;
    const path = lockPath(m.repo, m.lock);
    if (!list.includes(path)) list.push(path);
  }
  return [...locks]
    .map(([repo, paths]) => (paths.length ? `\`${repo}\` (${paths.map((p) => `\`${p}\``).join(', ')})` : `\`${repo}\``))
    .join(', ');
}

/**
 * The Claude Code prompt that applies the group fleet-wide; `branch` comes from the API, verbatim.
 * Null when any API value fails `isPromptSafe`: never a prompt built from unchecked data.
 */
export function buildPrompt(g: UpdateGroup, t: Translate): string | null {
  if (!isPromptSafe(g)) return null;
  const targets = targetsOf(g);
  const pkg = g.package;
  const parts: string[] = [];

  const retryWith = g.progress === ProgressEnum.Retry ? g.blocked?.by.find((b) => b.newer) : undefined;
  if (retryWith) {
    const issues = (g.blocked?.issues ?? []).map((i) => `${i.repo}#${i.number}`).join(', ');
    parts.push(
      issues
        ? t('updates.prompt.retry', { blocker: retryWith.package, newer: retryWith.newer, issues })
        : // Found in the locks (peer dependency / requires_dist), no [fleet] issue to cite.
          t('updates.prompt.retry_auto', {
            blocker: retryWith.package,
            newer: retryWith.newer,
            package: pkg,
            latest: g.latest ?? '',
          }),
    );
  }

  if (g.latest === null) {
    const max = g.security?.max_severity;
    const severity = max ? t(`updates.severity.${max}`) : t('updates.prompt.severity_unknown');
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
