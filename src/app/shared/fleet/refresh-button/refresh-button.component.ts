import { Component, DestroyRef, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from '@openng/optimus-ui/api';
import { ButtonModule } from '@openng/optimus-ui/button';

import { RefreshService } from '../../../api';

export type RefreshSource = 'health' | 'github' | 'sentry' | 'box' | 'deps';

/** Existing label keys, so the aria label names the source. */
const SOURCE_LABEL: Record<RefreshSource, string> = {
  health: 'overview.col.health',
  github: 'overview.col.github',
  sentry: 'overview.col.sentry',
  deps: 'overview.col.deps',
  box: 'overview.box',
};

/** The server dedupes refreshes for 60 s: stay disabled for the same window. */
export const REFRESH_COOLDOWN_MS = 60_000;

/** Icon-only "refresh collection" button for one source. */
@Component({
  selector: 'app-refresh-button',
  imports: [ButtonModule, TranslocoPipe],
  template: `
    <p-button
      icon="pi pi-refresh"
      [rounded]="true"
      [text]="true"
      size="small"
      severity="secondary"
      [disabled]="busy()"
      [ariaLabel]="'fleet.refresh.aria_source' | transloco: { source: (sourceKey() | transloco) }"
      (onClick)="refresh()"
    />
  `,
})
export class RefreshButtonComponent {
  readonly source = input.required<RefreshSource>();
  readonly queued = output<void>();
  protected readonly sourceKey = computed(() => SOURCE_LABEL[this.source()]);

  private readonly api = inject(RefreshService);
  private readonly messages = inject(MessageService);
  private readonly i18n = inject(TranslocoService);
  protected readonly busy = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected refresh(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.refreshCreate({ source: this.source() }).subscribe({
      next: (res) => {
        const already = !!res.already_queued;
        this.messages.add({
          severity: already ? 'info' : 'success',
          summary: this.i18n.translate(already ? 'fleet.refresh.already' : 'fleet.refresh.started'),
          life: 4000,
        });
        this.queued.emit();
        this.timer = setTimeout(() => this.busy.set(false), REFRESH_COOLDOWN_MS);
      },
      error: () => {
        this.messages.add({
          severity: 'error',
          summary: this.i18n.translate('fleet.refresh.error'),
          life: 6000,
        });
        this.busy.set(false);
      },
    });
  }
}
