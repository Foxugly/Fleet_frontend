import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { TagModule } from '@openng/optimus-ui/tag';

import { ReasonLabelPipe } from '../../shared/fleet/reason-label.pipe';
import { OverviewChipsComponent } from './overview-chips.component';
import { BOX_KEY, OverviewEntry, worstCell } from './overview-model';

/** One tile per entry (already sorted): worst-state border, worst reason as headline, chips. */
@Component({
  selector: 'app-overview-mosaic',
  imports: [RouterLink, TranslocoPipe, TagModule, ReasonLabelPipe, OverviewChipsComponent],
  templateUrl: './overview-mosaic.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './overview-mosaic.component.scss',
})
export class OverviewMosaicComponent {
  readonly entries = input.required<readonly OverviewEntry[]>();

  protected readonly boxKey = BOX_KEY;
  protected readonly worstCell = worstCell;
}
