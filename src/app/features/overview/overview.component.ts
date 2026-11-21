import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { Subject, catchError, map, merge, of, switchMap } from 'rxjs';

import { Overview, OverviewService } from '../../api';
import { visibleInterval } from '../../core/polling/visible-interval';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { AgePipe } from '../../shared/fleet/age.pipe';
import { RefreshButtonComponent } from '../../shared/fleet/refresh-button/refresh-button.component';
import { StateDotComponent } from '../../shared/fleet/state-dot/state-dot.component';

export const OVERVIEW_POLL_MS = 60_000;

type SiteColumn = 'health' | 'github' | 'sentry' | 'deps';

@Component({
  selector: 'app-overview',
  imports: [
    TranslocoPipe,
    RouterLink,
    ButtonModule,
    MessageModule,
    SkeletonModule,
    TagModule,
    PageHeaderComponent,
    StateDotComponent,
    RefreshButtonComponent,
    AgePipe,
  ],
  templateUrl: './overview.component.html',
  styleUrl: './overview.component.scss',
})
export class OverviewComponent {
  private readonly api = inject(OverviewService);
  private readonly reload$ = new Subject<void>();

  protected readonly data = signal<Overview | null>(null);
  protected readonly failed = signal(false);
  protected readonly columns: readonly { key: SiteColumn; label: string }[] = [
    { key: 'health', label: 'overview.col.health' },
    { key: 'github', label: 'overview.col.github' },
    { key: 'sentry', label: 'overview.col.sentry' },
    { key: 'deps', label: 'overview.col.deps' },
  ];
  protected readonly skeletonRows = [1, 2, 3, 4, 5];

  constructor() {
    merge(visibleInterval(OVERVIEW_POLL_MS), this.reload$)
      .pipe(
        // A failing request is caught inside, so the poll itself never dies.
        switchMap(() =>
          this.api.overviewRetrieve().pipe(
            map((overview) => ({ overview })),
            catchError(() => of({ overview: null })),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(({ overview }) => {
        if (overview) {
          this.data.set(overview);
          this.failed.set(false);
        } else {
          this.failed.set(true);
        }
      });
  }

  protected reload(): void {
    this.reload$.next();
  }
}
