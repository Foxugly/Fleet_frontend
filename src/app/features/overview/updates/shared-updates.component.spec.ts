import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { MessageService } from '@openng/optimus-ui/api';

import { ProgressEnum, UpdateGroup } from '../../../api';
import { authTestProviders } from '../../auth/auth-test-setup.testing';
import { SharedUpdatesComponent } from './shared-updates.component';
import { buildPrompt } from './update-prompt';
import { group } from './update-test-data.testing';

@Component({ template: '' })
class Stub {}

const isUpdates = (r: { url: string }) => r.url.endsWith('/api/v1/updates/');

const security = group({
  package: 'pillow',
  ecosystem: null,
  latest: null,
  kind: null,
  security: { alerts: 2, max_severity: 'critical' },
  branch: 'deps/pillow-security',
  members: [
    { site: 'a', repo: 'Foxugly/a', lock: null, current: null },
    { site: 'b', repo: 'Foxugly/b', lock: null, current: null },
  ],
});
const major = group({
  package: '@angular/core',
  ecosystem: 'npm',
  kind: 'major',
  latest: '22.0.0',
  branch: 'deps/@angular/core-22.0.0',
});
const minor = group();
const patch = group({
  package: 'requests',
  kind: 'patch',
  latest: '2.32.5',
  branch: 'deps/requests-2.32.5',
});

interface Mounted {
  fixture: ComponentFixture<SharedUpdatesComponent>;
  http: HttpTestingController;
  el: HTMLElement;
  messages: MessageService;
}

async function settle(fixture: ComponentFixture<SharedUpdatesComponent>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

async function mount(groups: UpdateGroup[] | 'error'): Promise<Mounted> {
  TestBed.configureTestingModule({
    providers: [...authTestProviders([{ path: 'sites/:slug', component: Stub }]), MessageService],
  });
  const fixture = TestBed.createComponent(SharedUpdatesComponent);
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const req = http.expectOne(isUpdates);
  if (groups === 'error') req.flush('boom', { status: 500, statusText: 'Server Error' });
  else req.flush({ generated_at: '2026-11-22T10:00:00Z', groups });
  await settle(fixture);
  return { fixture, http, el: fixture.nativeElement, messages: TestBed.inject(MessageService) };
}

const sectionKeys = (el: HTMLElement) =>
  Array.from(el.querySelectorAll<HTMLElement>('.shared-updates__section')).map(
    (s) => s.dataset['section'],
  );
const copyButton = (row: HTMLElement) =>
  row.querySelector<HTMLButtonElement>('.shared-updates__copy button')!;
const rowOf = (el: HTMLElement, pkg: string) =>
  Array.from(el.querySelectorAll<HTMLElement>('.shared-updates__row')).find(
    (r) => r.querySelector('.shared-updates__package')!.textContent!.trim() === pkg,
  )!;

describe('SharedUpdatesComponent', () => {
  let writeText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  });

  it('is hidden when there are no groups', async () => {
    const { el } = await mount([]);
    expect(el.querySelector('.shared-updates')).toBeNull();
  });

  it('says there is nothing to do once an empty answer arrived', async () => {
    const { el } = await mount([]);
    expect(el.querySelector('.shared-updates__none')!.textContent).toContain(
      'Aucune mise à jour ne concerne plusieurs apps',
    );
  });

  it('is hidden, without a console error, when the request fails (Review Focus 5)', async () => {
    const error = vi.spyOn(console, 'error');
    const { el } = await mount('error');
    expect(el.querySelector('.shared-updates')).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });

  it('counts the groups and renders the non-empty sections in order', async () => {
    const { fixture, el } = await mount([patch, minor, security, major]);
    expect(fixture.componentInstance.count()).toBe(4);
    expect(sectionKeys(el)).toEqual(['security', 'major', 'updates', 'patch']);
    // Under the panel title (h1 is the page header): no level skipped.
    expect(el.querySelectorAll('.shared-updates__section > h2').length).toBe(4);

    const { el: el2 } = await remount([minor]);
    expect(sectionKeys(el2)).toEqual(['updates']);
  });

  it('starts with the patches collapsed; the toggle reveals them', async () => {
    const { fixture, el } = await mount([minor, patch]);
    const toggle = el.querySelector<HTMLButtonElement>(
      '[data-section="patch"] .shared-updates__toggle',
    )!;
    const list = el.querySelector<HTMLElement>('#' + toggle.getAttribute('aria-controls'))!;
    expect(list).not.toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);
    expect(rowOf(el, 'django').closest('ul')!.hidden).toBe(false);
    toggle.click();
    await settle(fixture);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.hidden).toBe(false);
    expect(list.contains(rowOf(el, 'requests'))).toBe(true);
  });

  it('a row shows the version range, a chip per site linking to its deps tab, and the tags', async () => {
    const { el } = await mount([security, major, minor]);
    const django = rowOf(el, 'django');
    expect(django.querySelector('.shared-updates__versions')!.textContent).toContain(
      '5.2 – 6.0.1 → 6.1.2',
    );
    const chips = Array.from(django.querySelectorAll<HTMLAnchorElement>('a.shared-updates__site'));
    expect(chips.map((a) => a.textContent!.trim())).toEqual(['billing', 'poker']);
    expect(chips[0].getAttribute('href')).toBe('/sites/billing?tab=deps');
    expect(django.querySelector('.shared-updates__progress')!.textContent).toContain(
      'Pas commencé',
    );

    const angular = rowOf(el, '@angular/core');
    expect(angular.querySelector('.shared-updates__decide')!.textContent).toContain('à décider');

    const pillow = rowOf(el, 'pillow');
    expect(pillow.querySelector('.shared-updates__versions')!.textContent).toContain('sécurité');
    expect(pillow.querySelector('.shared-updates__severity')!.textContent).toContain('critique');
    expect(pillow.querySelector('.shared-updates__decide')).toBeNull();
  });

  it('a major with an alert sits in Sécurité and still shows « à décider »', async () => {
    const { el } = await mount([
      group({ kind: 'major', security: { alerts: 1, max_severity: 'high' } }),
    ]);
    expect(sectionKeys(el)).toEqual(['security']);
    expect(rowOf(el, 'django').querySelector('.shared-updates__decide')!.textContent).toContain(
      'à décider',
    );
  });

  it('a group with unchecked data shows a notice instead of the copy button (security)', async () => {
    const { el } = await mount([group({ branch: 'main' })]);
    const row = rowOf(el, 'django');
    expect(row.querySelector('.shared-updates__copy')).toBeNull();
    expect(row.querySelector('.shared-updates__unsafe')!.textContent).toContain(
      'prompt indisponible',
    );
  });

  it('skips PR and issue links that are not https (security)', async () => {
    const { el } = await mount([
      group({
        progress: ProgressEnum.Waiting,
        prs: [{ repo: 'Foxugly/a', number: 1, url: 'javascript:alert(1)', checks: 'pending' }],
        blocked: {
          issues: [{ repo: 'Foxugly/a', number: 2, url: 'http://evil/2' }],
          by: [{ package: 'drf', version: '3.16.1', newer: null, range: null }],
        },
      }),
    ]);
    const row = rowOf(el, 'django');
    expect(row.querySelector('a.shared-updates__pr')).toBeNull();
    expect(row.querySelector('a.shared-updates__issue')).toBeNull();
  });

  it('shows the progress and links the PRs', async () => {
    const { el } = await mount([
      group({
        progress: ProgressEnum.Blocked,
        prs: [
          {
            repo: 'Foxugly/billing_server',
            number: 7,
            url: 'https://github.com/Foxugly/billing_server/pull/7',
            checks: 'failure',
          },
        ],
      }),
    ]);
    const row = rowOf(el, 'django');
    const progress = row.querySelector('.shared-updates__progress')!;
    expect(progress.textContent).toContain('Bloqué');
    expect(progress.classList).toContain('shared-updates__progress--blocked');
    const link = row.querySelector<HTMLAnchorElement>('a.shared-updates__pr')!;
    expect(link.getAttribute('href')).toBe('https://github.com/Foxugly/billing_server/pull/7');
    expect(link.textContent).toContain('Foxugly/billing_server#7');
  });

  it('waiting: names the blocker, links the issues, and the copy button becomes « Copier quand même »', async () => {
    const { el } = await mount([
      group({
        progress: ProgressEnum.Waiting,
        blocked: {
          issues: [
            {
              repo: 'Foxugly/billing_server',
              number: 12,
              url: 'https://github.com/Foxugly/billing_server/issues/12',
            },
          ],
          by: [{ package: 'djangorestframework', version: '3.16.1', newer: null, range: null }],
        },
      }),
    ]);
    const row = rowOf(el, 'django');
    expect(row.querySelector('.shared-updates__progress')!.textContent).toContain(
      'En attente de djangorestframework > 3.16.1',
    );
    expect(
      row.querySelector<HTMLAnchorElement>('a.shared-updates__issue')!.getAttribute('href'),
    ).toBe('https://github.com/Foxugly/billing_server/issues/12');
    const copy = copyButton(row);
    expect(copy.textContent).toContain('Copier quand même');
    // WCAG 2.5.3: the accessible name contains the visible label.
    expect(copy.getAttribute('aria-label')).toContain('Copier quand même');
    expect(copy.disabled).toBe(false);
  });

  it('waiting from the locks (no issue): names the blocker and its declared range', async () => {
    const { el } = await mount([
      group({
        ecosystem: 'npm',
        package: 'typescript',
        latest: '7.0.2',
        kind: 'major',
        progress: ProgressEnum.Waiting,
        blocked: {
          issues: [],
          by: [{ package: '@angular/compiler-cli', version: '22.3.0', newer: null, range: '>=6.0 <6.1' }],
        },
      }),
    ]);
    const row = rowOf(el, 'typescript');
    expect(row.querySelector('.shared-updates__progress')!.textContent).toContain(
      'En attente de @angular/compiler-cli > 22.3.0',
    );
    expect(row.querySelector('.shared-updates__blocked-auto')!.textContent).toContain(
      'Bloqué par @angular/compiler-cli 22.3.0, qui exige >=6.0 <6.1',
    );
    expect(row.querySelector('a.shared-updates__issue')).toBeNull();
  });

  it('an issue-based block shows no lock-derived line', async () => {
    const { el } = await mount([
      group({
        progress: ProgressEnum.Waiting,
        blocked: {
          issues: [{ repo: 'Foxugly/billing_server', number: 12, url: 'https://github.com/x/12' }],
          by: [{ package: 'djangorestframework', version: '3.16.1', newer: null, range: null }],
        },
      }),
    ]);
    expect(rowOf(el, 'django').querySelector('.shared-updates__blocked-auto')).toBeNull();
  });

  it('retry: « À retenter » with the newer blocker version', async () => {
    const { el } = await mount([
      group({
        progress: ProgressEnum.Retry,
        blocked: {
          issues: [{ repo: 'Foxugly/billing_server', number: 12, url: 'https://github.com/x/12' }],
          by: [{ package: 'djangorestframework', version: '3.16.1', newer: '3.17.0', range: null }],
        },
      }),
    ]);
    const progress = rowOf(el, 'django').querySelector('.shared-updates__progress')!;
    expect(progress.textContent).toContain('À retenter : djangorestframework 3.17.0 disponible');
    expect(progress.classList).toContain('shared-updates__progress--retry');
  });

  it("« Copier le prompt » copies buildPrompt's text and shows a success toast", async () => {
    const { fixture, el, messages } = await mount([minor]);
    const add = vi.spyOn(messages, 'add');
    const copy = copyButton(rowOf(el, 'django'));
    expect(copy.textContent).toContain('Copier le prompt');
    copy.click();
    await settle(fixture);
    const i18n = TestBed.inject(TranslocoService);
    expect(writeText).toHaveBeenCalledWith(
      buildPrompt(minor, (k, p) => i18n.translate(k, p as Record<string, unknown>)),
    );
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    expect(el.querySelector('.shared-updates__manual')).toBeNull();
  });

  it('when the clipboard rejects: an error toast and the prompt in a read-only block (Review Focus 4)', async () => {
    writeText.mockRejectedValue(new Error('denied'));
    const { fixture, el, messages } = await mount([minor]);
    const add = vi.spyOn(messages, 'add');
    copyButton(rowOf(el, 'django')).click();
    await settle(fixture);
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    const box = el.querySelector<HTMLTextAreaElement>('textarea.shared-updates__manual')!;
    expect(box.readOnly).toBe(true);
    expect(box.value).toContain('Mets à jour `django` vers `6.1.2`');
    expect(box.getAttribute('aria-label')).toContain('django');
    expect(document.activeElement).toBe(box);
  });

  it('with no clipboard at all (insecure context): the same fallback', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const { fixture, el, messages } = await mount([minor]);
    const add = vi.spyOn(messages, 'add');
    copyButton(rowOf(el, 'django')).click();
    await settle(fixture);
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ severity: 'error' }));
    expect(el.querySelector('textarea.shared-updates__manual')).not.toBeNull();
  });

  it('keeps the last groups when a later poll fails', async () => {
    const { fixture, http, el } = await mount([minor]);
    fixture.componentInstance.reload();
    http.expectOne(isUpdates).flush('boom', { status: 503, statusText: 'Service Unavailable' });
    await settle(fixture);
    expect(rowOf(el, 'django')).toBeDefined();
  });

  it('reload() fetches again', async () => {
    const { fixture, http, el } = await mount([]);
    fixture.componentInstance.reload();
    http.expectOne(isUpdates).flush({ generated_at: '2026-11-22T10:01:00Z', groups: [minor] });
    await settle(fixture);
    expect(el.querySelector('.shared-updates')).not.toBeNull();
  });
});

async function remount(groups: UpdateGroup[]): Promise<Mounted> {
  TestBed.resetTestingModule();
  return mount(groups);
}
