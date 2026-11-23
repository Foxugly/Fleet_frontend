import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { Cell, Reason } from '../../api';

/**
 * A reason's text in the active language. A string `note` param (a hold's comment, taken
 * from a repository: untrusted) is appended after the translation, never interpolated
 * into it, and only ever rendered as plain text. Its `{{` / `}}` get a zero-width space:
 * the text is later passed as a param of other translations (tooltips, aria-labels),
 * whose interpolation would otherwise read them as placeholders.
 */
export function reasonText(i18n: TranslocoService, reason: Reason): string {
  const params = reason.params ?? {};
  const text = i18n.translate(`reason.${reason.code}`, params);
  const note = params['note'];
  if (typeof note !== 'string' || !note.trim()) return text;
  return `${text} — ${note.trim().replace(/([{}])(?=[{}])/g, '$1​')}`;
}

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
      if (this.has(key)) return reasonText(this.i18n, reason);
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
      .map((n) => reasonText(this.i18n, n))
      .join(' · ');
  }
}

/** The tooltip of a cell: the error, else the reason, plus the notes the reason does not already say. */
export function cellTip(cell: Cell, reason: string, notes: string): string {
  if (cell.error) return cell.error;
  return notes && notes !== reason ? `${reason} · ${notes}` : reason;
}
