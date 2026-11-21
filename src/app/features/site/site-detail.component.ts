import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, OnDestroy, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { PanelModule } from 'primeng/panel';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { Subject as RxSubject, catchError, distinctUntilChanged, map, of, switchMap } from 'rxjs';

import { SiteDetail, SitesService, Subject } from '../../api';
import { LastVisitService } from '../../core/last-visit/last-visit.service';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { AgePipe } from '../../shared/fleet/age.pipe';
import { RefreshButtonComponent } from '../../shared/fleet/refresh-button/refresh-button.component';
import { DepsData, GithubData, HealthData, SentryData } from '../../shared/fleet/source-data';
import { StateDotComponent } from '../../shared/fleet/state-dot/state-dot.component';
import { DepsSectionComponent } from './sections/deps-section.component';
import { GithubSectionComponent } from './sections/github-section.component';
import { HealthSectionComponent } from './sections/health-section.component';
import { SentrySectionComponent } from './sections/sentry-section.component';

type SourceKey = 'health' | 'github' | 'sentry' | 'deps';
const SOURCES: readonly SourceKey[] = ['health', 'github', 'sentry', 'deps'];

@Component({
  selector: 'app-site-detail',
  imports: [
    TranslocoPipe,
    RouterLink,
    ButtonModule,
    MessageModule,
    PanelModule,
    SkeletonModule,
    TagModule,
    PageHeaderComponent,
    EmptyStateComponent,
    StateDotComponent,
    RefreshButtonComponent,
    AgePipe,
    HealthSectionComponent,
    GithubSectionComponent,
    SentrySectionComponent,
    DepsSectionComponent,
  ],
  templateUrl: './site-detail.component.html',
  styleUrl: './site-detail.component.scss',
})
export class SiteDetailComponent implements OnDestroy {
  private readonly api = inject(SitesService);
  private readonly visits = inject(LastVisitService);
  private readonly request$ = new RxSubject<string>();

  protected readonly slug = signal('');
  /** Previous visit, read once when the slug is opened so « nouveau » markers survive until we leave. */
  protected readonly since = signal<Date | null>(null);
  protected readonly site = signal<SiteDetail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly failed = signal(false);

  protected readonly sources = computed(() => {
    const s = this.site();
    if (!s) return [];
    return SOURCES.map((key) => ({
      key,
      cell: s.sources[key].cell,
      items: Object.entries(s.sources[key].items).map(([name, subject]) => ({ name, subject })),
    }));
  });
  protected readonly skeletons = [1, 2, 3, 4];

  constructor() {
    this.request$
      .pipe(
        switchMap((slug) =>
          this.api.siteRetrieve({ slug }).pipe(
            map((site) => ({ site, status: 0 })),
            catchError((e: unknown) => of({ site: null, status: e instanceof HttpErrorResponse ? e.status : -1 })),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(({ site, status }) => {
        if (site) {
          this.site.set(site);
          this.failed.set(false);
        } else if (status === 404) {
          this.site.set(null);
          this.notFound.set(true);
        } else {
          this.failed.set(true);
        }
      });

    inject(ActivatedRoute)
      .paramMap.pipe(
        map((p) => p.get('slug') ?? ''),
        distinctUntilChanged(),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((slug) => this.open(slug));
  }

  ngOnDestroy(): void {
    if (this.slug()) this.visits.markVisited('site:' + this.slug());
  }

  protected reload(): void {
    this.request$.next(this.slug());
  }

  private open(slug: string): void {
    const previous = this.slug();
    if (previous) this.visits.markVisited('site:' + previous);
    this.slug.set(slug);
    this.since.set(this.visits.lastVisit('site:' + slug));
    this.site.set(null);
    this.notFound.set(false);
    this.failed.set(false);
    this.request$.next(slug);
  }

  protected health(s: Subject): HealthData | null {
    return s.data as HealthData | null;
  }
  protected github(s: Subject): GithubData | null {
    return s.data as GithubData | null;
  }
  protected sentry(s: Subject): SentryData | null {
    return s.data as SentryData | null;
  }
  protected deps(s: Subject): DepsData | null {
    return s.data as DepsData | null;
  }
}
