import { TestBed } from '@angular/core/testing';

import { Clock } from '../../../shared/fleet/clock';
import { DepsData, GithubData, HealthData, SentryData } from '../../../shared/fleet/source-data';
import { authTestProviders } from '../../auth/auth-test-setup.testing';
import { DepsSectionComponent } from './deps-section.component';
import { GithubSectionComponent } from './github-section.component';
import { HealthSectionComponent } from './health-section.component';
import { SentrySectionComponent } from './sentry-section.component';

const NOW = new Date('2026-11-21T12:00:00Z');
const SINCE = new Date('2026-11-20T00:00:00Z');

function render(type: unknown, inputs: Record<string, unknown>): HTMLElement {
  TestBed.configureTestingModule({ providers: [...authTestProviders(), { provide: Clock, useValue: { now: () => NOW } }] });
  const fixture = TestBed.createComponent(type as never);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const anchors = (el: HTMLElement) => Array.from(el.querySelectorAll<HTMLAnchorElement>('a[href]'));

describe('HealthSectionComponent', () => {
  it('shows status, latency and TLS; a TLS expiry under 14 days is flagged', () => {
    const data: HealthData = { status: 200, latency_ms: 123, error: '', tls_days_left: 9 };
    const el = render(HealthSectionComponent, { data });
    expect(el.textContent).toContain('200');
    expect(el.textContent).toContain('123');
    expect(el.querySelector('.tls-warn')).not.toBeNull();
  });

  it('does not flag a comfortable TLS expiry', () => {
    const el = render(HealthSectionComponent, { data: { status: 200, latency_ms: 5, error: '', tls_days_left: 60 } });
    expect(el.querySelector('.tls-warn')).toBeNull();
  });

  it('shows the probe error', () => {
    const el = render(HealthSectionComponent, { data: { status: null, latency_ms: null, error: 'timeout', tls_days_left: null } });
    expect(el.textContent).toContain('timeout');
  });
});

describe('GithubSectionComponent', () => {
  const data = (): GithubData => ({
    prs: [
      { number: 1, title: 'Old PR', url: 'https://github.com/o/r/pull/1', author: 'ann', is_dependabot: false, draft: false, checks: 'success', merge_state: 'clean', created_at: '2026-11-01T00:00:00Z' },
      { number: 2, title: 'New PR', url: 'https://github.com/o/r/pull/2', author: null, is_dependabot: true, draft: true, checks: 'failure', merge_state: 'dirty', created_at: '2026-11-21T00:00:00Z' },
    ],
    issues: [],
    dependabot_alerts: [{ package: 'lodash', severity: 'high', url: 'https://github.com/o/r/security/1', created_at: '2026-11-10T00:00:00Z' }],
    code_scanning: [{ rule: 'js/xss', severity: null, path: null, url: 'https://github.com/o/r/code/1' }],
    secret_scanning: [{ type: 'aws_key', url: 'javascript:alert(1)' }],
    main_run: { sha: 'abc', conclusion: 'failure', url: 'https://github.com/o/r/actions/1', workflow: 'CI', created_at: '2026-11-21T00:00:00Z' },
  });

  it('lists PRs newest first and tags only the one newer than the previous visit', () => {
    const el = render(GithubSectionComponent, { data: data(), since: SINCE });
    const titles = Array.from(el.querySelectorAll('.pr-row .row-title')).map((e) => e.textContent!.trim());
    expect(titles).toEqual(['New PR', 'Old PR']);
    const rows = el.querySelectorAll('.pr-row');
    expect(rows[0].querySelector('.tag-new')).not.toBeNull();
    expect(rows[1].querySelector('.tag-new')).toBeNull();
  });

  it('marks nothing as new without a previous visit', () => {
    const el = render(GithubSectionComponent, { data: data(), since: null });
    expect(el.querySelector('.tag-new')).toBeNull();
  });

  it('opens links in a new tab with noopener noreferrer, https only', () => {
    const links = anchors(render(GithubSectionComponent, { data: data(), since: SINCE }));
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a.target).toBe('_blank');
      expect(a.rel).toBe('noopener noreferrer');
      expect(a.href.startsWith('https://')).toBe(true);
    }
  });

  it('refuses a non-https link as an anchor but keeps the text', () => {
    const el = render(GithubSectionComponent, { data: data(), since: SINCE });
    expect(el.innerHTML).not.toContain('javascript:');
    expect(el.textContent).toContain('aws_key');
  });

  it('tolerates null author, severity, path and main run', () => {
    const d = data();
    d.main_run = null;
    const el = render(GithubSectionComponent, { data: d, since: null });
    expect(el.textContent).toContain('js/xss');
  });

  it('shows short muted lines for empty lists, not the empty state', () => {
    const el = render(GithubSectionComponent, {
      data: { prs: [], issues: [], dependabot_alerts: [], code_scanning: [], secret_scanning: [], main_run: null },
      since: null,
    });
    expect(el.textContent).toContain('Aucune PR ouverte');
    expect(el.querySelector('app-empty-state')).toBeNull();
  });
});

describe('SentrySectionComponent', () => {
  const data = (): SentryData => ({
    unresolved: 3,
    new_24h: 1,
    issues: [
      { title: 'Old', culprit: 'a.b', count: 4, last_seen: '2026-11-10T00:00:00Z', first_seen: '2026-11-01T00:00:00Z', url: 'https://sentry.io/i/1', level: 'error' },
      { title: 'Fresh', culprit: null, count: 1, last_seen: '2026-11-21T10:00:00Z', first_seen: '2026-11-21T09:00:00Z', url: 'http://sentry.io/i/2', level: null },
    ],
  });

  it('shows counts and issues newest first, new tag on first_seen after the visit', () => {
    const el = render(SentrySectionComponent, { data: data(), since: SINCE });
    const rows = el.querySelectorAll('.issue-row');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Fresh');
    expect(rows[0].querySelector('.tag-new')).not.toBeNull();
    expect(rows[1].querySelector('.tag-new')).toBeNull();
  });

  it('does not link a non-https issue url', () => {
    const el = render(SentrySectionComponent, { data: data(), since: SINCE });
    expect(anchors(el).map((a) => a.href)).toEqual(['https://sentry.io/i/1']);
  });
});

describe('DepsSectionComponent', () => {
  it('shows ecosystem, checked count and the outdated table with kind tags', () => {
    const data: DepsData = {
      ecosystem: 'npm',
      checked: 42,
      outdated: [
        { name: 'rxjs', current: '7.0.0', latest: '8.0.0', kind: 'major' },
        { name: 'odd', current: '1.0', latest: null, kind: 'unknown' },
      ],
    };
    const el = render(DepsSectionComponent, { data });
    expect(el.textContent).toContain('npm');
    expect(el.textContent).toContain('42');
    expect(el.querySelectorAll('tbody tr').length).toBe(2);
    expect(el.querySelector('.kind-major')).not.toBeNull();
    expect(el.querySelector('.kind-unknown')).not.toBeNull();
  });

  it('says so when everything is up to date', () => {
    const el = render(DepsSectionComponent, { data: { ecosystem: 'python', checked: 10, outdated: [] } });
    expect(el.querySelector('table')).toBeNull();
    expect(el.textContent).toContain('à jour');
  });
});
