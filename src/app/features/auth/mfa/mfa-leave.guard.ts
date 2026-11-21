import { CanDeactivateFn } from '@angular/router';

export interface MfaLeaveAware {
  canLeave(): boolean;
}

/** Leaving /mfa while the recovery codes are shown and not acknowledged is refused
 * (the server shows them once): Back, topmenu links, any router navigation.
 * Kept apart from the component so the route can reference it without defeating lazy loading. */
export const mfaLeaveGuard: CanDeactivateFn<MfaLeaveAware> = (component) => component?.canLeave() ?? true;
