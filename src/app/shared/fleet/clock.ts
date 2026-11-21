import { Injectable } from '@angular/core';

/** Injectable time source so age rendering is deterministic in tests. */
@Injectable({ providedIn: 'root' })
export class Clock {
  now(): Date {
    return new Date();
  }
}
