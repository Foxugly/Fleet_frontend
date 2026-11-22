import { TestBed } from '@angular/core/testing';
import { provideTransloco } from '@jsverse/transloco';
import { afterEach, describe, expect, it } from 'vitest';

import { FooterComponent } from './footer.component';

describe('FooterComponent version', () => {
  afterEach(() => {
    delete window.__FLEET_VERSION;
  });

  function render(): string {
    TestBed.configureTestingModule({
      providers: [provideTransloco({ config: { availableLangs: ['fr'], defaultLang: 'fr' } })],
    });
    return TestBed.createComponent(FooterComponent).componentInstance.version;
  }

  it('shows window.__FLEET_VERSION when set', () => {
    window.__FLEET_VERSION = 'abc1234 (2026-11-21)';
    expect(render()).toBe('abc1234 (2026-11-21)');
  });

  it('falls back to the build constant', () => {
    expect(render()).toBe('0.1.0');
  });
});
