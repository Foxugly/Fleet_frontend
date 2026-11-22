import {
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { PanelModule } from 'primeng/panel';
import { TagModule } from 'primeng/tag';
import { Subject, catchError, map, merge, of, switchMap } from 'rxjs';

import { ProgressEnum, UpdateGroup, UpdatesService } from '../../../api';
import { visibleInterval } from '../../../core/polling/visible-interval';
import { safeUrl } from '../../site/site-helpers';
import { OVERVIEW_POLL_MS } from '../overview-model';
import {
  SEVERITIES,
  UPDATE_SECTIONS,
  UpdateSection,
  buildPrompt,
  isPromptSafe,
  sectionOf,
  versionRange,
} from './update-prompt';

const groupKey = (g: UpdateGroup) => `${g.ecosystem ?? ''}|${g.package}|${g.latest ?? ''}`;

interface Row {
  key: string;
  group: UpdateGroup;
  versions: string | null;
  sites: string[];
  /** The blocker named by the waiting/retry tag. */
  blocker: { package: string; version: string; newer: string | null } | null;
  severity: string | null;
  /** False when an API value failed the prompt checks: a notice replaces the copy button. */
  safe: boolean;
}

/** Dependency updates shared by ≥ 2 apps, each with a ready-made Claude Code prompt. */
@Component({
  selector: 'app-shared-updates',
  imports: [TranslocoPipe, RouterLink, ButtonModule, PanelModule, TagModule],
  templateUrl: './shared-updates.component.html',
  styleUrl: './shared-updates.component.scss',
})
export class SharedUpdatesComponent {
  private readonly api = inject(UpdatesService);
  private readonly messages = inject(MessageService);
  private readonly i18n = inject(TranslocoService);
  private readonly injector = inject(Injector);
  private readonly reload$ = new Subject<void>();

  protected readonly groups = signal<UpdateGroup[]>([]);
  protected readonly sections = computed(() => {
    const rows = this.groups().map((g) => this.toRow(g));
    return UPDATE_SECTIONS.map((key) => ({ key, rows: rows.filter((r) => sectionOf(r.group) === key) })).filter(
      (s) => s.rows.length,
    );
  });
  protected readonly patchesOpen = signal(false);
  /** The prompt shown inline after a failed copy, by group key. */
  protected readonly manual = signal<{ key: string; text: string } | null>(null);
  private readonly manualBox = viewChild<ElementRef<HTMLTextAreaElement>>('manualBox');
  protected readonly Progress = ProgressEnum;
  /** PR and issue URLs come from GitHub data: only https links are rendered. */
  protected readonly link = safeUrl;

  constructor() {
    merge(visibleInterval(OVERVIEW_POLL_MS), this.reload$)
      .pipe(
        // A failure never reaches the overview (Review Focus 5). The first one leaves the
        // panel hidden; a later one keeps the last good groups.
        switchMap(() =>
          this.api.updatesRetrieve().pipe(
            map((r) => r.groups),
            catchError(() => of(null)),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((groups) => {
        if (groups) this.groups.set(groups);
      });
  }

  /** Called by the overview's reload button. */
  reload(): void {
    this.reload$.next();
  }

  protected isOpen(section: UpdateSection): boolean {
    return section !== 'patch' || this.patchesOpen();
  }

  protected togglePatches(): void {
    this.patchesOpen.update((open) => !open);
  }

  protected copy(row: Row): void {
    const text = buildPrompt(row.group, (key, params) => this.i18n.translate(key, params as Record<string, unknown>));
    if (text === null) return; // unsafe data: the template renders no button then
    // navigator.clipboard is undefined outside a secure context.
    const write = navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard'));
    write.then(
      () => {
        if (this.manual()?.key === row.key) this.manual.set(null);
        this.messages.add({ severity: 'success', summary: this.i18n.translate('updates.copied'), life: 4000 });
      },
      () => {
        this.manual.set({ key: row.key, text });
        afterNextRender({ write: () => this.manualBox()?.nativeElement.focus() }, { injector: this.injector });
        this.messages.add({ severity: 'error', summary: this.i18n.translate('updates.copy_failed'), life: 6000 });
      },
    );
  }

  private toRow(g: UpdateGroup): Row {
    const by = g.blocked?.by ?? [];
    const blocker =
      g.progress === ProgressEnum.Retry
        ? (by.find((b) => b.newer) ?? null)
        : g.progress === ProgressEnum.Waiting
          ? (by[0] ?? null)
          : null;
    const max = g.security?.max_severity ?? null;
    return {
      key: groupKey(g),
      group: g,
      versions: versionRange(g),
      sites: [...new Set(g.members.map((m) => m.site))],
      blocker,
      severity: g.security ? (max && SEVERITIES.includes(max) ? max : 'unknown') : null,
      safe: isPromptSafe(g),
    };
  }
}
