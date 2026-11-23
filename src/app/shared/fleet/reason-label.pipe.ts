import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { Cell } from '../../api';

/**
 * Cell -> short human reason ("Répond 502", "3 ouvert(s)"...), translated from the
 * API's `reason {code, params}`. With no reason, or a code this UI does not know yet,
 * falls back to the generic per-state text, so a raw key is never shown.
 * Impure on purpose: it must follow a language switch (as `AgePipe` does).
 */
@Pipe({ name: 'reasonLabel', standalone: true, pure: false })
export class ReasonLabelPipe implements PipeTransform {
  private readonly i18n = inject(TranslocoService);

  transform(cell: Cell): string {
    const reason = cell.reason;
    if (reason) {
      const key = `reason.${reason.code}`;
      if (this.has(key)) return this.i18n.translate(key, reason.params ?? {});
    }
    return this.i18n.translate(`reason.fallback.${cell.state}`, { n: cell.count });
  }

  /** Checks the active language's loaded catalog: no reliance on missing-key logging. */
  private has(key: string): boolean {
    const catalog = this.i18n.getTranslation(this.i18n.getActiveLang());
    return typeof catalog?.[key] === 'string';
  }
}

/**
 * Cell -> its `notes` (information that does not change the colour, e.g. updates
 * blocked by an installed package), translated and joined; '' when there are none.
 * Codes this UI does not know are skipped, never shown as raw keys.
 */
@Pipe({ name: 'notesLabel', standalone: true, pure: false })
export class NotesLabelPipe implements PipeTransform {
  private readonly i18n = inject(TranslocoService);

  transform(cell: Cell): string {
    const catalog = this.i18n.getTranslation(this.i18n.getActiveLang());
    return (cell.notes ?? [])
      .filter((n) => typeof catalog?.[`reason.${n.code}`] === 'string')
      .map((n) => this.i18n.translate(`reason.${n.code}`, n.params ?? {}))
      .join(' · ');
  }
}

/** The tooltip of a cell: the error, else the reason, plus the notes the reason does not already say. */
export function cellTip(cell: Cell, reason: string, notes: string): string {
  if (cell.error) return cell.error;
  return notes && notes !== reason ? `${reason} · ${notes}` : reason;
}
