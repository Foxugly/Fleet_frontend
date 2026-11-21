/**
 * Hand-written types for the free-JSON `data` of each source (the API types it
 * as an opaque object). Keys mirror Fleet_server/apps/collect/sources/*.py.
 * Fields the collectors may emit as null are typed nullable.
 */

export interface HealthData {
  status: number | null;
  latency_ms: number | null;
  error: string;
  tls_days_left: number | null;
}

export interface Pr {
  number: number;
  title: string;
  url: string;
  author: string | null;
  is_dependabot: boolean;
  draft: boolean;
  checks: 'failure' | 'pending' | 'success' | 'none';
  merge_state: string;
  created_at: string;
}

export interface Issue {
  number: number;
  title: string;
  url: string;
  created_at: string;
}

export interface DependabotAlert {
  package: string;
  severity: string;
  url: string;
  created_at: string;
}

/** The collector does not emit `created_at` for code-scanning alerts. */
export interface CodeScanningAlert {
  rule: string;
  severity: string | null;
  path: string | null;
  url: string;
}

export interface SecretAlert {
  type: string;
  url: string;
}

export interface MainRun {
  sha: string;
  conclusion: 'success' | 'failure';
  url: string;
  workflow: string;
  created_at: string;
}

export interface GithubData {
  prs: Pr[];
  issues: Issue[];
  dependabot_alerts: DependabotAlert[];
  code_scanning: CodeScanningAlert[];
  secret_scanning: SecretAlert[];
  main_run: MainRun | null;
}

export interface SentryIssue {
  title: string | null;
  culprit: string | null;
  count: number;
  last_seen: string | null;
  first_seen: string | null;
  url: string | null;
  level: string | null;
}

export interface SentryData {
  unresolved: number;
  new_24h: number;
  issues: SentryIssue[];
}

export interface DepsData {
  ecosystem: 'python' | 'npm';
  outdated: { name: string; current: string; latest: string | null; kind: 'major' | 'minor' | 'patch' | 'unknown' }[];
  checked: number;
}

export interface AptUpgrade {
  package: string;
  version: string;
  origin: string;
  security: boolean;
  /** Present only when apt printed an "upgradable from" version. */
  from_version?: string;
}

export interface BoxData {
  apt: AptUpgrade[];
  reboot_required: boolean;
  reboot_pkgs: string[];
  failed_units: string[];
  disk: { mount: string; used_pct: number };
  memory: { total_mb: number; available_mb: number };
}
