import { Component, computed, input, ChangeDetectionStrategy } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { TooltipModule } from '@openng/optimus-ui/tooltip';

import { NotesLabelPipe, ReasonLabelPipe, cellTip } from '../../shared/fleet/reason-label.pipe';
import { OverviewEntry, SOURCES } from './overview-model';

/** One state-coloured label chip per source of an entry; full text in a tooltip. */
@Component({
  selector: 'app-overview-chips',
  imports: [TranslocoPipe, ReasonLabelPipe, NotesLabelPipe, TooltipModule],
  template: `
    <ul class="overview-chips">
      @for (s of sources(); track s.key) {
        @let source = s.label | transloco;
        @let reason = s.cell | reasonLabel;
        @let notes = s.cell | notesLabel;
        <li
          class="overview-chip overview-chip--{{ s.cell.state }}"
          [class.overview-chip--noted]="!!notes"
          [pTooltip]="'overview.chip' | transloco: { source, reason: cellTip(s.cell, reason, notes) }"
        >
          <span class="overview-chip__source">{{ source }}</span>
          @if (notes) {
            <i class="pi pi-lock overview-chip__note" aria-hidden="true"></i>
          }
          <span class="overview-chip__reason">{{ reason }}</span>
        </li>
      }
    </ul>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './overview-chips.component.scss',
})
export class OverviewChipsComponent {
  readonly entry = input.required<OverviewEntry>();

  protected readonly cellTip = cellTip;

  protected readonly sources = computed(() => {
    const cells = this.entry().cells;
    return SOURCES.flatMap((s) => {
      const cell = cells[s.key];
      return cell ? [{ key: s.key, label: s.label, cell }] : [];
    });
  });
}
