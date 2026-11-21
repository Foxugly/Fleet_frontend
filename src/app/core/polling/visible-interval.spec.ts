import { Subscription } from 'rxjs';

import { visibleInterval } from './visible-interval';

function setVisibility(state: 'visible' | 'hidden'): void {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('visibleInterval', () => {
  let sub: Subscription | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  });
  afterEach(() => {
    sub?.unsubscribe();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('emits at once, then every period while visible', () => {
    const spy = vi.fn();
    sub = visibleInterval(1000).subscribe(spy);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it('stops emitting while hidden and emits at once on return', () => {
    const spy = vi.fn();
    sub = visibleInterval(1000).subscribe(spy);
    setVisibility('hidden');
    vi.advanceTimersByTime(5000);
    expect(spy).toHaveBeenCalledTimes(1);
    setVisibility('visible');
    expect(spy).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it('cleans up on unsubscribe', () => {
    const spy = vi.fn();
    sub = visibleInterval(1000).subscribe(spy);
    sub.unsubscribe();
    vi.advanceTimersByTime(5000);
    setVisibility('visible');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
