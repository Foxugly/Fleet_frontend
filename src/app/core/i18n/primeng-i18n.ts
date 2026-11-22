import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoService } from '@jsverse/transloco';
import { PrimeNG } from 'primeng/config';
import { switchMap } from 'rxjs';

/**
 * Feeds PrimeNG's built-in labels from the Transloco catalog so they follow the
 * active language. Today: `aria.removeLabel`, the name PrimeNG gives a chip's remove
 * button (inventory list fields); its English default « Remove » is never shown in French.
 */
@Injectable({ providedIn: 'root' })
export class PrimeNgI18n {
  private readonly transloco = inject(TranslocoService);
  private readonly primeng = inject(PrimeNG);
  private readonly destroyRef = inject(DestroyRef);

  start(): void {
    this.transloco.langChanges$
      .pipe(
        switchMap((lang) => this.transloco.selectTranslate('common.remove', {}, lang)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((removeLabel: string) => {
        const aria = this.primeng.getTranslation('aria') ?? {};
        this.primeng.setTranslation({ aria: { ...aria, removeLabel } });
      });
  }
}
