import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from '@openng/optimus-ui/button';
import { MessageModule } from '@openng/optimus-ui/message';
import { SkeletonModule } from '@openng/optimus-ui/skeleton';
import { TabsModule } from '@openng/optimus-ui/tabs';
import { TagModule } from '@openng/optimus-ui/tag';
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
import { SOURCES, SourceKey, defaultTab } from './site-helpers';

@Component({
  selector: 'app-site-detail',
  imports: [
    TranslocoPipe,
    RouterLink,
    ButtonModule,
    MessageModule,
    TabsModule,
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly request$ = new RxSubject<string>();

  protected readonly slug = signal('');
  /** Previous visit, read once when the slug is opened so « nouveau » markers survive until we leave. */
  protected readonly since = signal<Date | null>(null);
  protected readonly site = signal<SiteDetail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly failed = signal(false);
  /** Slug whose data was actually loaded: only that visit is marked (a failed load or a 404 is not a visit). */
  private loadedSlug: string | null = null;

  protected readonly sources = computed(() => {
    const s = this.site();
    if (!s) return [];
    return SOURCES.map((key) => ({
      key,
      cell: s.sources[key].cell,
      items: Object.entries(s.sources[key].items).map(([name, subject]) => ({ name, subject })),
    }));
  });
  private readonly tabParam = toSignal(this.route.queryParamMap.pipe(map((p) => p.get('tab'))), {
    initialValue: null,
  });
  /** Open tab: the `tab` query param when valid, else the worst source. */
  protected readonly activeTab = computed<SourceKey>(() => {
    const found = SOURCES.find((k) => k === this.tabParam());
    if (found) return found;
    const s = this.site();
    if (!s) return SOURCES[0];
    return defaultTab({
      health: s.sources.health.cell,
      github: s.sources.github.cell,
      sentry: s.sources.sentry.cell,
      deps: s.sources.deps.cell,
    });
  });
  protected readonly skeletons = [1, 2, 3, 4];

  constructor() {
    // On a phone the tab list scrolls: bring the active tab into view (it can be the last one).
    // On the next task, once the tabs of a just-loaded site are rendered (zoneless: an
    // afterNextRender queued from an effect may wait for an unrelated change; a frame
    // callback never runs in a background tab).
    effect((onCleanup) => {
      const key = this.activeTab();
      if (!this.site()) return;
      const timer = setTimeout(() => {
        const tab = this.host.nativeElement.querySelector<HTMLElement>(
          `p-tab[data-source="${key}"]`,
        );
        tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      });
      onCleanup(() => clearTimeout(timer));
    });

    this.request$
      .pipe(
        switchMap((slug) =>
          this.api.siteRetrieve({ slug }).pipe(
            map((site) => ({ site, status: 0 })),
            catchError((e: unknown) =>
              of({ site: null, status: e instanceof HttpErrorResponse ? e.status : -1 }),
            ),
          ),
        ),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(({ site, status }) => {
        if (site) {
          this.site.set(site);
          this.loadedSlug = this.slug();
          this.failed.set(false);
        } else if (status === 404) {
          this.site.set(null);
          this.notFound.set(true);
        } else {
          this.failed.set(true);
        }
      });

    this.route.paramMap
      .pipe(
        map((p) => p.get('slug') ?? ''),
        distinctUntilChanged(),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((slug) => this.open(slug));
  }

  ngOnDestroy(): void {
    this.markLoadedVisit();
  }

  protected selectTab(value: string | number | undefined): void {
    if (value === undefined || value === this.activeTab()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: value },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  protected reload(): void {
    this.request$.next(this.slug());
  }

  private open(slug: string): void {
    this.markLoadedVisit();
    this.loadedSlug = null;
    this.slug.set(slug);
    this.since.set(this.visits.lastVisit('site:' + slug));
    this.site.set(null);
    this.notFound.set(false);
    this.failed.set(false);
    this.request$.next(slug);
  }

  private markLoadedVisit(): void {
    if (this.loadedSlug) this.visits.markVisited('site:' + this.loadedSlug);
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
