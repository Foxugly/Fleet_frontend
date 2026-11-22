import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { Subject, catchError, map, merge, of, switchMap } from 'rxjs';

import { Overview, OverviewService } from '../../api';
import { visibleInterval } from '../../core/polling/visible-interval';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { AgePipe } from '../../shared/fleet/age.pipe';
import { RefreshButtonComponent } from '../../shared/fleet/refresh-button/refresh-button.component';
import { OverviewListComponent } from './overview-list.component';
import {
  Bucket,
  NO_FILTER,
  OverviewFilter,
  SITE_SOURCES,
  SOURCES,
  SiteSource,
  buildEntries,
  filterEntries,
  isFiltering,
  parseFilter,
  summarize,
} from './overview-model';
import { OverviewMosaicComponent } from './overview-mosaic.component';
import { OverviewView, readView, writeView } from './view-pref';

export const OVERVIEW_POLL_MS = 60_000;

@Component({
  selector: 'app-overview',
  imports: [
    TranslocoPipe,
    FormsModule,
    ButtonModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    SelectModule,
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

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  /** Search and filters live in the URL: they survive a visit to a site and the back button. */
  private readonly query = toSignal(this.route.queryParamMap);
  protected readonly filter = computed<OverviewFilter>(() => {
    const params = this.query();
    return params ? parseFilter(params) : NO_FILTER;
  });
  protected readonly filtering = computed(() => isFiltering(this.filter()));
  protected readonly shown = computed(() => filterEntries(this.entries(), this.filter()));
  protected readonly buckets: readonly Bucket[] = ['handle', 'watch', 'ok'];
  /** Translated in code: the select also uses the label as each option's accessible name. */
  private readonly sourceLabels = toSignal(
    inject(TranslocoService).selectTranslate<string[]>(SITE_SOURCES.map((key) => SOURCES.find((s) => s.key === key)!.label)),
    { initialValue: [] as string[] },
  );
  protected readonly sourceOptions = computed(() =>
    SITE_SOURCES.map((key, i) => ({ value: key, label: this.sourceLabels()[i] ?? '' })),
  );
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

  protected setSearch(q: string): void {
    this.setFilter({ q });
  }

  /** Clicking the active bucket again clears it. */
  protected toggleBucket(b: Bucket): void {
    this.setFilter({ bucket: this.filter().bucket === b ? null : b });
  }

  protected setSource(source: SiteSource | null): void {
    this.setFilter({ source });
  }

  protected clearFilters(): void {
    this.setFilter(NO_FILTER);
  }

  private setFilter(change: Partial<OverviewFilter>): void {
    const f = { ...this.filter(), ...change };
    void this.router.navigate([], {
      relativeTo: this.route,
      // null removes the param: a clean URL when nothing is filtered.
      queryParams: { q: f.q.trim() || null, bucket: f.bucket, source: f.source },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected reload(): void {
    this.reload$.next();
  }
}
