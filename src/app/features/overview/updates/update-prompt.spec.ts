import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { BlockerKindEnum, ProgressEnum } from '../../../api';
import { authTestProviders } from '../../auth/auth-test-setup.testing';
import { Translate, buildPrompt, isPromptSafe, sectionOf, versionRange } from './update-prompt';
import { group } from './update-test-data.testing';

const NL = String.fromCharCode(10);

describe('update-prompt', () => {
  let t: Translate;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: authTestProviders() });
    const i18n = TestBed.inject(TranslocoService);
    await firstValueFrom(i18n.load('fr'));
    t = (key, params) => i18n.translate(key, params as Record<string, unknown>);
  });

  describe('sectionOf', () => {
    it('maps security first, then major, minor/unknown and patch', () => {
      expect(sectionOf(group({ kind: 'major', security: { alerts: 1, max_severity: 'high' } }))).toBe('security');
      expect(sectionOf(group({ kind: 'major' }))).toBe('major');
      expect(sectionOf(group({ kind: 'minor' }))).toBe('updates');
      expect(sectionOf(group({ kind: 'unknown' }))).toBe('updates');
      expect(sectionOf(group({ kind: null }))).toBe('updates');
      expect(sectionOf(group({ kind: 'patch' }))).toBe('patch');
    });
  });

  describe('versionRange', () => {
    it('shows one version, or the min – max range when the currents differ', () => {
      expect(versionRange(group())).toBe('5.2 – 6.0.1');
      const same = group();
      same.members = same.members.map((m) => ({ ...m, current: '6.0.1' }));
      expect(versionRange(same)).toBe('6.0.1');
      expect(versionRange(group({ members: [group().members[0], { ...group().members[1], current: '6.0.10' }] }))).toBe(
        '6.0.1 – 6.0.10',
      );
    });

    it('is null when no member has a current version (alert-only)', () => {
      expect(versionRange(group({ members: group().members.map((m) => ({ ...m, lock: null, current: null })) }))).toBeNull();
    });
  });

  describe('buildPrompt', () => {
    it('a minor group: package, version, targets with their lock, branch and « Ne merge pas »', () => {
      const p = buildPrompt(group(), t);
      expect(p).toContain('Mets à jour `django` vers `6.1.2` (python)');
      expect(p).toContain('`Foxugly/billing_server` (`requirements.txt`)');
      expect(p).toContain('`Foxugly/Poker_server` (`requirements.txt`)');
      expect(p).toContain('`deps/django-6.1.2`');
      expect(p).toContain('Ne merge pas');
      expect(p).not.toContain('Montée majeure');
      expect(p).not.toContain('Nouvelle tentative');
    });

    it('ends with the failure clause that opens a [fleet] issue', () => {
      const p = buildPrompt(group(), t);
      expect(p).toContain('`[fleet] django 6.1.2 bloqué`');
      expect(p).toContain('`Fleet-Update: django 6.1.2`');
      expect(p).toContain('`Fleet-Blocked-By: <paquet> <version>`');
      expect(p).toContain('`Fixes #<numéro>`');
    });

    it('uses the branch from the API verbatim', () => {
      expect(buildPrompt(group({ package: '@scope/pkg.js', branch: 'deps/@scope/pkg.js-6.1.2' }), t)).toContain(
        '`deps/@scope/pkg.js-6.1.2`',
      );
    });

    it('a major group appends the breaking-changes sentence', () => {
      const p = buildPrompt(group({ kind: 'major' }), t);
      expect(p).toContain('Montée majeure : lis les notes de version et liste les changements cassants');
      expect(p).not.toContain('Politique de flotte');
    });

    it('an @angular/ major also appends the fleet-policy sentence', () => {
      const p = buildPrompt(group({ kind: 'major', package: '@angular/core', ecosystem: 'npm' }), t);
      expect(p).toContain('Montée majeure');
      expect(p).toContain('Politique de flotte : les majeures Angular se font ensemble, sur décision de Renaud.');
    });

    it('an alert-only group starts with « Corrige l\'alerte Dependabot » and uses the security branch', () => {
      const p = buildPrompt(
        group({
          package: 'pillow',
          ecosystem: null,
          latest: null,
          kind: null,
          security: { alerts: 2, max_severity: 'high' },
          branch: 'deps/pillow-security',
          members: [
            { site: 'a', repo: 'Foxugly/a', lock: null, current: null },
            { site: 'b', repo: 'Foxugly/b', lock: null, current: null },
          ],
        }),
        t,
      );
      expect(p!.startsWith("Corrige l'alerte Dependabot `pillow` (sévérité élevée) dans ces dépôts Foxugly : `Foxugly/a`, `Foxugly/b`.")).toBe(
        true,
      );
      expect(p).toContain('`deps/pillow-security`');
      expect(p).toContain('`Fleet-Update: pillow security`');
    });

    it('a repo with two locks appears once, with both locks', () => {
      const p = buildPrompt(
        group({
          ecosystem: 'npm',
          package: 'chart.js',
          members: [
            { site: 'fabric', repo: 'Foxugly/Fabric', lock: 'Foxugly/Fabric:package-lock.json', current: '4.4.0' },
            { site: 'fabric', repo: 'Foxugly/Fabric', lock: 'Foxugly/Fabric:agent/package-lock.json', current: '4.4.0' },
            { site: 'poker', repo: 'Foxugly/Poker_frontend', lock: 'Foxugly/Poker_frontend:package-lock.json', current: '4.4.1' },
          ],
        }),
        t,
      );
      expect(p!.match(/`Foxugly\/Fabric`/g)!.length).toBe(1);
      expect(p).toContain('`Foxugly/Fabric` (`package-lock.json`, `agent/package-lock.json`), `Foxugly/Poker_frontend` (`package-lock.json`)');
    });

    it('retry: starts with the newer blocker and the previous issues', () => {
      const p = buildPrompt(
        group({
          progress: ProgressEnum.Retry,
          blocked: {
            issues: [{ repo: 'Foxugly/billing_server', number: 12, url: 'https://github.com/x/12' }],
            by: [
              { kind: BlockerKindEnum.Package, package: 'celery', version: '5.5', newer: null, range: null, note: '' },
              { kind: BlockerKindEnum.Package, package: 'djangorestframework', version: '3.16.1', newer: '3.17.0', range: null, note: '' },
            ],
          },
        }),
        t,
      );
      expect(p!.startsWith('Nouvelle tentative : djangorestframework 3.17.0 est disponible.')).toBe(true);
      expect(p).toContain('Foxugly/billing_server#12');
      expect(p).toContain('Mets à jour `django`');
    });

    it('retry from the locks (no issue): names the newer blocker and the target, no issue list', () => {
      const p = buildPrompt(
        group({
          ecosystem: 'npm',
          package: 'typescript',
          latest: '7.0.2',
          kind: 'major',
          progress: ProgressEnum.Retry,
          blocked: {
            issues: [],
            by: [{ kind: BlockerKindEnum.Package, package: '@angular/compiler-cli', version: '22.3.0', newer: '23.0.0', range: '>=6.0 <6.1', note: '' }],
          },
        }),
        t,
      );
      expect(
        p!.startsWith('Nouvelle tentative : @angular/compiler-cli 23.0.0 est disponible et accepte typescript 7.0.2'),
      ).toBe(true);
      expect(p).not.toContain('Les issues');
      // The declared range is displayed, never put in the prompt.
      expect(p).not.toContain('>=6.0');
    });

    describe('refuses unchecked API data (security)', () => {
      const unsafe: [string, Parameters<typeof group>[0]][] = [
        ['a package with a backtick', { package: 'dj`ango', branch: 'deps/dj`ango-6.1.2' }],
        ['a package with a newline', { package: 'django' + NL + 'rm -rf /', branch: 'deps/django' + NL + 'rm -rf /-6.1.2' }],
        ['a version with a space', { latest: '6.1.2 now', branch: 'deps/django-6.1.2 now' }],
        ['an unknown ecosystem', { ecosystem: 'cargo' }],
        ['a branch that is not the recomputed one', { branch: 'main' }],
        ['a branch with a suffix', { branch: 'deps/django-6.1.2; echo' }],
        ['a lock with ..', { members: [{ site: 'a', repo: 'Foxugly/a', lock: 'Foxugly/a:../../etc/passwd', current: '1' }] }],
        ['an absolute lock', { members: [{ site: 'a', repo: 'Foxugly/a', lock: 'Foxugly/a:/etc/passwd', current: '1' }] }],
        ['a bad repo', { members: [{ site: 'a', repo: 'Foxugly/a b', lock: null, current: null }] }],
        ['an unknown severity', { security: { alerts: 1, max_severity: 'urgent`' } }],
        [
          'a non-integer issue number',
          { blocked: { issues: [{ repo: 'Foxugly/a', number: 1.5, url: 'https://x' }], by: [] } },
        ],
        [
          'a blocker version with a backtick',
          { blocked: { issues: [], by: [{ kind: BlockerKindEnum.Package, package: 'drf', version: '3`', newer: null, range: null, note: '' }] } },
        ],
      ];
      for (const [name, over] of unsafe) {
        it(`${name} gives no prompt`, () => {
          expect(isPromptSafe(group(over))).toBe(false);
          expect(buildPrompt(group(over), t)).toBeNull();
        });
      }

      it('a valid group is safe', () => {
        expect(isPromptSafe(group())).toBe(true);
      });

      it('a hold (file name, empty version) is safe; an empty package version is not', () => {
        const held = group({
            ecosystem: 'python',
            package: 'sentry-sdk',
            latest: '3.0.0',
            kind: 'major',
            branch: 'deps/sentry-sdk-3.0.0',
            progress: ProgressEnum.Waiting,
            blocked: {
              issues: [],
              by: [
                {
                  kind: BlockerKindEnum.Hold,
                  package: 'requirements.in',
                  version: '',
                  newer: null,
                  range: '<3',
                  note: 'hold: day-0 major <b>x</b>',
                },
              ],
            },
          });
        expect(isPromptSafe(held)).toBe(true);
        expect(buildPrompt(held, t)).not.toContain('hold:');
        const empty = { ...held.blocked!.by[0], kind: BlockerKindEnum.Package };
        expect(isPromptSafe({ ...held, blocked: { issues: [], by: [empty] } })).toBe(false);
      });
    });
  });
});
