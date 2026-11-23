import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from '@openng/optimus-ui/button';
import { TagModule } from '@openng/optimus-ui/tag';

import { StateEnum } from '../../api';
import { OverviewChipsComponent } from './overview-chips.component';
import { BOX_KEY, OverviewEntry } from './overview-model';

/**
 * One row per entry (already sorted). Green entries are collapsed behind a "+N" button,
 * shown in their sorted place (after the orange ones, before the all-none ones) once expanded.
 */
@Component({
  selector: 'app-overview-list',
  imports: [
    NgTemplateOutlet,
    RouterLink,
    TranslocoPipe,
    ButtonModule,
    TagModule,
    OverviewChipsComponent,
  ],
  templateUrl: './overview-list.component.html',
  styleUrl: './overview-list.component.scss',
})
export class OverviewListComponent {
  readonly entries = input.required<readonly OverviewEntry[]>();
  /** False while a search or filter is active: what matched is shown, green included. */
  readonly collapseOk = input(true);

  protected readonly boxKey = BOX_KEY;
  /** In memory only: every visit starts collapsed. */
  protected readonly expanded = signal(false);
  protected readonly showOk = computed(() => this.expanded() || !this.collapseOk());

  /** The box stays first whatever its state; only green sites collapse. */
  protected readonly groups = computed(() => {
    const before: OverviewEntry[] = [];
    const ok: OverviewEntry[] = [];
    const after: OverviewEntry[] = [];
    for (const e of this.entries()) {
      if (e.key === BOX_KEY) before.push(e);
      else if (e.worst === StateEnum.Green) ok.push(e);
      else if (e.worst === StateEnum.None) after.push(e);
      else before.push(e);
    }
    return { before, ok, after };
  });
}
