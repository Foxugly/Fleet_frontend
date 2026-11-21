import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EnvironmentProviders, Provider } from '@angular/core';
import { Routes, provideRouter } from '@angular/router';
import { Translation, TranslocoLoader, provideTransloco } from '@jsverse/transloco';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { of } from 'rxjs';

/** Test helper: the real French catalog, loaded synchronously. */
class FrLoader implements TranslocoLoader {
  getTranslation() {
    return of(JSON.parse(readFileSync(join(process.cwd(), 'public', 'i18n', 'fr.json'), 'utf-8')) as Translation);
  }
}

export function authTestProviders(routes: Routes = []): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter(routes),
    provideHttpClient(),
    provideHttpClientTesting(),
    provideTransloco({ config: { availableLangs: ['fr', 'en'], defaultLang: 'fr' }, loader: FrLoader }),
  ];
}
