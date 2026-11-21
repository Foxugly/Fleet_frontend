import { Component, Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { Translation, TranslocoLoader, TranslocoService, provideTransloco } from '@jsverse/transloco';
import { Observable, delay, of } from 'rxjs';
import { FleetTitleStrategy } from './fleet-title.strategy';

const CATALOGS: Record<string, Translation> = {
  fr: { overview: { title: "Vue d'ensemble" } },
  en: { overview: { title: 'Overview' } },
};

/** Async loader: the catalog is NOT available synchronously, like the HTTP loader. */
@Injectable()
class SlowLoader implements TranslocoLoader {
  getTranslation(lang: string): Observable<Translation> {
    return of(CATALOGS[lang]).pipe(delay(20));
  }
}

@Component({ template: '' })
class Page {}

describe('FleetTitleStrategy', () => {
  let title: Title;
  let router: Router;
  let transloco: TranslocoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page, data: { titleKey: 'overview.title' } },
          { path: 'bare', component: Page },
        ]),
        { provide: TitleStrategy, useClass: FleetTitleStrategy },
        provideTransloco({
          config: { availableLangs: ['fr', 'en'], defaultLang: 'fr' },
          loader: SlowLoader,
        }),
      ],
    });
    title = TestBed.inject(Title);
    router = TestBed.inject(Router);
    transloco = TestBed.inject(TranslocoService);
    title.setTitle('');
  });

  const settle = () => new Promise((r) => setTimeout(r, 80));

  it('never shows the raw key and formats « {page} — Fleet » once the catalog loads', async () => {
    await router.navigateByUrl('/');
    expect(title.getTitle()).not.toContain('overview.title');
    await settle();
    expect(title.getTitle()).toBe("Vue d'ensemble — Fleet");
  });

  it('follows a language switch', async () => {
    await router.navigateByUrl('/');
    await settle();
    transloco.setActiveLang('en');
    await settle();
    expect(title.getTitle()).toBe('Overview — Fleet');
  });

  it('uses just « Fleet » for a route without titleKey', async () => {
    await router.navigateByUrl('/bare');
    await settle();
    expect(title.getTitle()).toBe('Fleet');
  });
});
