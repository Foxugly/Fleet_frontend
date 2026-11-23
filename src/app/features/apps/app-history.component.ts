import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { SkeletonModule } from '@openng/optimus-ui/skeleton';
import { TagModule } from '@openng/optimus-ui/tag';

import { AppChange, AppsService } from '../../api';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { ChangeRow, changedFields, fieldLabelKey, formatValue } from './inventory-model';

const ACTIONS = ['create', 'update', 'archive', 'restore'];

interface Entry {
  at: string;
  user: string | null;
  actionKey: string | null;
  action: string;
  rows: ChangeRow[];
}

/** Audit trail of one app (`/apps/:slug/history`): per change, only the fields that moved, before → after. */
@Component({
  selector: 'app-app-history',
  imports: [
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    ButtonModule,
    MessageModule,
    SkeletonModule,
    TagModule,
    EmptyStateComponent,
    PageHeaderComponent,
  ],
  templateUrl: './app-history.component.html',
  styleUrl: './app-history.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppHistoryComponent {
  private readonly api = inject(AppsService);
  protected readonly slug = inject(ActivatedRoute).snapshot.paramMap.get('slug') ?? '';
  protected readonly entries = signal<Entry[] | null>(null);
  protected readonly failed = signal(false);
  protected readonly format = formatValue;
  protected readonly labelKey = fieldLabelKey;

  constructor() {
    this.api.appsChanges({ slug: this.slug }).subscribe({
      next: (changes) => this.entries.set(changes.map(toEntry)),
      error: () => this.failed.set(true),
    });
  }
}

function toEntry(c: AppChange): Entry {
  return {
    at: c.at,
    user: c.user,
    action: c.action,
    actionKey: ACTIONS.includes(c.action) ? `apps.history.action.${c.action}` : null,
    rows: changedFields(c.before, c.after),
  };
}
