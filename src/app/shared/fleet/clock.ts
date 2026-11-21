import { DOCUMENT, DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';

/** How often displayed ages are re-evaluated. */
export const CLOCK_TICK_MS = 30_000;

/**
 * Injectable time source. `now` is a signal ticking every CLOCK_TICK_MS and on
 * the tab becoming visible again: the app is zoneless, so a template reading it
 * (through AgePipe) re-renders as time passes, and an age shown next to stale
 * data keeps growing even when no new data arrives. Fakeable in tests
 * (`{ now: () => date }`).
 */
@Injectable({ providedIn: 'root' })
export class Clock {
  private readonly current = signal(new Date());
  readonly now: Signal<Date> = this.current.asReadonly();

  constructor() {
    const doc = inject(DOCUMENT);
    const tick = () => this.current.set(new Date());
    const onVisibility = () => {
      if (doc.visibilityState === 'visible') tick();
    };
    const timer = setInterval(tick, CLOCK_TICK_MS);
    doc.addEventListener('visibilitychange', onVisibility);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      doc.removeEventListener('visibilitychange', onVisibility);
    });
  }
}
