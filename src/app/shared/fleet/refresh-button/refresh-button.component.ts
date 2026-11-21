import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';

import { RefreshService } from '../../../api';

export type RefreshSource = 'health' | 'github' | 'sentry' | 'box' | 'deps';

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
      [ariaLabel]="'fleet.refresh.aria' | transloco"
      (onClick)="refresh()"
    />
  `,
})
export class RefreshButtonComponent {
  readonly source = input.required<RefreshSource>();
  readonly queued = output<void>();

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
