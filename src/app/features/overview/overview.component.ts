import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SkeletonModule } from 'primeng/skeleton';
import { Subject, catchError, map, merge, of, switchMap } from 'rxjs';

import { Overview, OverviewService } from '../../api';
import { visibleInterval } from '../../core/polling/visible-interval';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { AgePipe } from '../../shared/fleet/age.pipe';
import { RefreshButtonComponent } from '../../shared/fleet/refresh-button/refresh-button.component';
import { OverviewListComponent } from './overview-list.component';
import { SOURCES, buildEntries, summarize } from './overview-model';
import { OverviewMosaicComponent } from './overview-mosaic.component';
import { OverviewView, readView, writeView } from './view-pref';

export const OVERVIEW_POLL_MS = 60_000;

@Component({
  selector: 'app-overview',
  imports: [
    TranslocoPipe,
    ButtonModule,
    MessageModule,
    SkeletonModule,
    PageHeaderComponent,
    OverviewListComponent,
    OverviewMosaicComponent,
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
  protected readonly entries = computed(() => {
    const d = this.data();
    return d ? buildEntries(d) : [];
  });
  protected readonly summary = computed(() => summarize(this.entries()));
  protected readonly sources = SOURCES;
  protected readonly views: readonly { key: OverviewView; label: string; icon: string }[] = [
    { key: 'list', label: 'overview.view.list', icon: 'pi-list' },
    { key: 'mosaic', label: 'overview.view.mosaic', icon: 'pi-th-large' },
  ];
  /** Independent of the data: a failed poll never resets it. */
  protected readonly view = signal<OverviewView>(readView());
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

  protected setView(view: OverviewView): void {
    this.view.set(view);
    writeView(view);
  }

  protected reload(): void {
    this.reload$.next();
  }
}
