import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { PanelModule } from 'primeng/panel';
import { ProgressBarModule } from 'primeng/progressbar';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';

import { Box, BoxService } from '../../api';
import { LastVisitService } from '../../core/last-visit/last-visit.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { AgePipe } from '../../shared/fleet/age.pipe';
import { RefreshButtonComponent } from '../../shared/fleet/refresh-button/refresh-button.component';
import { BoxData } from '../../shared/fleet/source-data';
import { StateDotComponent } from '../../shared/fleet/state-dot/state-dot.component';

export const DISK_CRITICAL_PCT = 90;

@Component({
  selector: 'app-box',
  imports: [
    TranslocoPipe,
    ButtonModule,
    MessageModule,
    PanelModule,
    ProgressBarModule,
    SkeletonModule,
    TagModule,
    PageHeaderComponent,
    StateDotComponent,
    RefreshButtonComponent,
    AgePipe,
  ],
  templateUrl: './box.component.html',
  styleUrl: './box.component.scss',
})
export class BoxComponent implements OnDestroy {
  private readonly api = inject(BoxService);
  private readonly visits = inject(LastVisitService);

  protected readonly box = signal<Box | null>(null);
  protected readonly failed = signal(false);
  protected readonly loading = signal(true);
  protected readonly skeletons = [1, 2, 3];
  /** True once some data was actually loaded: only then is the visit worth recording. */
  private loadedData = false;

  protected readonly data = computed(() => (this.box()?.data ?? null) as BoxData | null);
  /** Security upgrades first, apt order kept inside each group. */
  protected readonly apt = computed(() => {
    const apt = this.data()?.apt ?? [];
    return [...apt.filter((p) => p.security), ...apt.filter((p) => !p.security)];
  });
  protected readonly diskCritical = computed(() => (this.data()?.disk.used_pct ?? 0) >= DISK_CRITICAL_PCT);

  constructor() {
    this.reload();
  }

  ngOnDestroy(): void {
    if (this.loadedData) this.visits.markVisited('box');
  }

  protected reload(): void {
    this.api.boxRetrieve().subscribe({
      next: (b) => {
        this.box.set(b);
        this.failed.set(false);
        this.loading.set(false);
        if (b.data !== null) this.loadedData = true;
      },
      error: () => {
        this.failed.set(true);
        this.loading.set(false);
      },
    });
  }
}
