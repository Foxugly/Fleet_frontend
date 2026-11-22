import { signal } from '@angular/core';
import { Observable } from 'rxjs';

import { writeFailure } from './inventory-model';

export interface StepUpRequest<T> {
  /** What the code confirms, translated (shown in the dialog). */
  subject: string;
  /** The write, given the code just typed (the code is never kept). */
  send: (code: string) => Observable<T>;
  done: (result: T) => void;
  /** Server validation errors: the dialog is already closed. */
  fields: (errors: Record<string, string[]>) => void;
}

/**
 * State of the TOTP step-up dialog for one page: `start` opens it for a write,
 * `submit` (bound to the dialog's `confirmed`) sends it. A refused code, a 429 or a
 * network failure keeps the dialog open with the message and the pending write, so
 * the user just types the next code; nothing the page holds is lost.
 */
export class StepUp {
  readonly open = signal(false);
  readonly busy = signal(false);
  readonly errorKey = signal<string | null>(null);
  readonly subject = signal<string | null>(null);
  private pending: StepUpRequest<unknown> | null = null;

  /** @param unavailableKey message for a network/5xx failure (pages without form data say so differently). */
  constructor(private readonly unavailableKey = 'apps.error.unavailable') {}

  start<T>(request: StepUpRequest<T>): void {
    this.pending = request as StepUpRequest<unknown>;
    this.subject.set(request.subject);
    this.errorKey.set(null);
    this.open.set(true);
  }

  submit(code: string): void {
    const request = this.pending;
    if (!request || this.busy()) return;
    this.busy.set(true);
    this.errorKey.set(null);
    request.send(code).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.open.set(false);
        this.pending = null;
        request.done(result);
      },
      error: (err: unknown) => {
        this.busy.set(false);
        const failure = writeFailure(err);
        if (failure.kind === 'fields') {
          this.open.set(false);
          request.fields(failure.errors);
        } else {
          this.open.set(true);
          this.errorKey.set(failure.key === 'apps.error.unavailable' ? this.unavailableKey : failure.key);
        }
      },
    });
  }
}
