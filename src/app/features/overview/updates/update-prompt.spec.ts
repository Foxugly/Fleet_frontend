import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

import { ProgressEnum } from '../../../api';
import { authTestProviders } from '../../auth/auth-test-setup.testing';
import { Translate, buildPrompt, sectionOf, versionRange } from './update-prompt';
import { group } from './update-test-data.testing';

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
      expect(buildPrompt(group({ branch: 'deps/odd-name' }), t)).toContain('`deps/odd-name`');
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
      expect(p.startsWith("Corrige l'alerte Dependabot `pillow` (sévérité high) dans ces dépôts Foxugly : `Foxugly/a`, `Foxugly/b`.")).toBe(
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
      expect(p.match(/`Foxugly\/Fabric`/g)!.length).toBe(1);
      expect(p).toContain('`Foxugly/Fabric` (`package-lock.json`, `agent/package-lock.json`), `Foxugly/Poker_frontend` (`package-lock.json`)');
    });

    it('retry: starts with the newer blocker and the previous issues', () => {
      const p = buildPrompt(
        group({
          progress: ProgressEnum.Retry,
          blocked: {
            issues: [{ repo: 'Foxugly/billing_server', number: 12, url: 'https://github.com/x/12' }],
            by: [
              { package: 'celery', version: '5.5', newer: null },
              { package: 'djangorestframework', version: '3.16.1', newer: '3.17.0' },
            ],
          },
        }),
        t,
      );
      expect(p.startsWith('Nouvelle tentative : djangorestframework 3.17.0 est disponible.')).toBe(true);
      expect(p).toContain('Foxugly/billing_server#12');
      expect(p).toContain('Mets à jour `django`');
    });
  });
});
