import { Observable } from 'rxjs';

/**
 * Emits immediately, then every `periodMs` while the tab is visible. Emits at once when
 * the tab becomes visible again and stays silent while it is hidden.
 */
export function visibleInterval(periodMs: number): Observable<void> {
  return new Observable<void>((subscriber) => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      clearInterval(timer);
      timer = undefined;
    };
    const start = () => {
      stop();
      timer = setInterval(() => subscriber.next(), periodMs);
    };
    const onChange = () => {
      if (document.visibilityState === 'visible') {
        subscriber.next();
        start();
      } else {
        stop();
      }
    };

    subscriber.next();
    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onChange);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onChange);
    };
  });
}
