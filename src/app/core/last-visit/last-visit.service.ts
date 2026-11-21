import { Injectable } from '@angular/core';

const PREFIX = 'fleet.lastVisit.';

/**
 * Per-scope "last visit" marker in localStorage (scopes: `site:<slug>`, `box`)
 * so the dashboard can highlight what is new. Storage may be unavailable
 * (private mode, blocked): every access is guarded and degrades to "nothing new".
 */
@Injectable({ providedIn: 'root' })
export class LastVisitService {
  lastVisit(scope: string): Date | null {
    try {
      const raw = localStorage.getItem(PREFIX + scope);
      if (!raw) return null;
      const t = Date.parse(raw);
      return Number.isNaN(t) ? null : new Date(t);
    } catch {
      return null;
    }
  }

  markVisited(scope: string): void {
    try {
      localStorage.setItem(PREFIX + scope, new Date().toISOString());
    } catch {
      /* storage unavailable: nothing to remember */
    }
  }

  /** True only when both dates exist and `iso` is later than the last visit. */
  isNew(iso: string | null, scope: string): boolean {
    const last = this.lastVisit(scope);
    if (!iso || !last) return false;
    const t = Date.parse(iso);
    return !Number.isNaN(t) && t > last.getTime();
  }
}
