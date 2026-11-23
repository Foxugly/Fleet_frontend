import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TooltipModule } from '@openng/optimus-ui/tooltip';

import { Cell } from '../../../api';
import { AgePipe } from '../age.pipe';
import { ReasonLabelPipe } from '../reason-label.pipe';

/** Coloured dot + count + age for one dashboard cell. Stale/error are never green. */
@Component({
  selector: 'app-state-dot',
  imports: [TranslocoPipe, AgePipe, ReasonLabelPipe, TooltipModule],
  templateUrl: './state-dot.component.html',
  styleUrl: './state-dot.component.scss',
})
export class StateDotComponent {
  readonly cell = input.required<Cell>();
  readonly label = input.required<string>();
  /** Hide the age text (still in the aria label): for tight places like tab labels. */
  readonly compact = input(false);
}
