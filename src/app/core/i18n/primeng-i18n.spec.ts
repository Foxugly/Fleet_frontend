import { TestBed } from '@angular/core/testing';
import { Translation, TranslocoLoader, TranslocoService, provideTransloco } from '@jsverse/transloco';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrimeNG } from 'primeng/config';
import { of } from 'rxjs';

import { PrimeNgI18n } from './primeng-i18n';

class FileLoader implements TranslocoLoader {
  getTranslation(lang: string) {
    return of(JSON.parse(readFileSync(join(process.cwd(), 'public', 'i18n', `${lang}.json`), 'utf-8')) as Translation);
  }
}

describe('PrimeNgI18n', () => {
  it("follows the active language for PrimeNG's own aria labels (chip « Retirer »)", async () => {
    TestBed.configureTestingModule({
      providers: [provideTransloco({ config: { availableLangs: ['fr', 'en'], defaultLang: 'fr' }, loader: FileLoader })],
    });
    TestBed.inject(PrimeNgI18n).start();
    const primeng = TestBed.inject(PrimeNG);
    await new Promise((r) => setTimeout(r));
    expect(primeng.getTranslation('aria')['removeLabel']).toBe('Retirer');
    TestBed.inject(TranslocoService).setActiveLang('en');
    await new Promise((r) => setTimeout(r));
    expect(primeng.getTranslation('aria')['removeLabel']).toBe('Remove');
  });
});
