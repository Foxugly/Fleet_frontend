import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

import { Clock } from './clock';

/**
 * ISO timestamp -> "just now" / "N min|h|d ago" (translated); null or unparsable ->
 * "never collected". Impure on purpose: it must follow the active language
 * and the passing time (a pure pipe would freeze both until the input changes).
 */
@Pipe({ name: 'age', standalone: true, pure: false })
export class AgePipe implements PipeTransform {
  private readonly clock = inject(Clock);
  private readonly i18n = inject(TranslocoService);

  transform(iso: string | null | undefined): string {
    const then = iso ? Date.parse(iso) : NaN;
    if (Number.isNaN(then)) return this.i18n.translate('fleet.age.never');
    const minutes = Math.floor(Math.max(0, this.clock.now().getTime() - then) / 60_000);
    if (minutes < 1) return this.i18n.translate('fleet.age.now');
    if (minutes < 60) return this.i18n.translate('fleet.age.minutes', { n: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return this.i18n.translate('fleet.age.hours', { n: hours });
    return this.i18n.translate('fleet.age.days', { n: Math.floor(hours / 24) });
  }
}
