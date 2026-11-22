import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';

import { AppOut, AppsService } from '../../api';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { StepUp } from './step-up';
import { TotpDialogComponent } from './totp-dialog.component';

/** « Inventaire »: every app of the fleet, archived ones behind a toggle; archive/restore ask the TOTP code. */
@Component({
  selector: 'app-apps-list',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    ButtonModule,
    CheckboxModule,
    MessageModule,
    SkeletonModule,
    TagModule,
    EmptyStateComponent,
    PageHeaderComponent,
    TotpDialogComponent,
  ],
  templateUrl: './apps-list.component.html',
  styleUrl: './apps-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppsListComponent {
  private readonly api = inject(AppsService);
  private readonly messages = inject(MessageService);
  private readonly i18n = inject(TranslocoService);

  protected readonly apps = signal<AppOut[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly showArchived = signal(false);
  protected readonly stepUp = new StepUp();
  protected readonly skeletons = [1, 2, 3];

  protected readonly archivedCount = computed(() => (this.apps() ?? []).filter((a) => a.archived).length);
  protected readonly visible = computed(() =>
    (this.apps() ?? [])
      .filter((a) => this.showArchived() || !a.archived)
      .sort((a, b) => a.slug.localeCompare(b.slug)),
  );

  constructor() {
    this.load();
  }

  protected load(): void {
    this.failed.set(false);
    this.api.appsList().subscribe({
      next: (apps) => this.apps.set(apps),
      error: () => this.failed.set(true),
    });
  }

  protected archive(app: AppOut): void {
    this.toggle(app, true);
  }

  protected restore(app: AppOut): void {
    this.toggle(app, false);
  }

  private toggle(app: AppOut, archive: boolean): void {
    const slug = app.slug;
    this.stepUp.start({
      send: (code) =>
        archive ? this.api.appsArchive({ slug, totpOnly: { totp_code: code } }) : this.api.appsRestore({ slug, totpOnly: { totp_code: code } }),
      done: (updated: AppOut) => {
        this.apps.update((list) => (list ?? []).map((a) => (a.slug === updated.slug ? updated : a)));
        this.messages.add({
          severity: 'success',
          summary: this.i18n.translate(archive ? 'apps.toast.archived' : 'apps.toast.restored', { slug }),
          life: 4000,
        });
      },
      fields: (errors) => {
        // e.g. « already archived » after a change in another tab: show it, then reload the truth.
        this.messages.add({
          severity: 'error',
          summary: this.i18n.translate('apps.toast.refused'),
          detail: Object.values(errors).flat().join(' '),
          life: 6000,
        });
        this.load();
      },
    });
  }
}
