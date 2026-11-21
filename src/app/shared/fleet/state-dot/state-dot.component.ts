import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TooltipModule } from 'primeng/tooltip';

import { Cell } from '../../../api';
import { AgePipe } from '../age.pipe';

/** Coloured dot + count + age for one dashboard cell. Stale/error are never green. */
@Component({
  selector: 'app-state-dot',
  imports: [TranslocoPipe, AgePipe, TooltipModule],
  templateUrl: './state-dot.component.html',
  styleUrl: './state-dot.component.scss',
})
export class StateDotComponent {
  readonly cell = input.required<Cell>();
  readonly label = input.required<string>();
}
