import { Injectable, OnDestroy, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription, switchMap } from 'rxjs';

const APP_NAME = 'Fleet';

/**
 * Page title « {page} — Fleet ». The page name comes from the route's
 * `data.titleKey` (a Transloco key), or verbatim from the route param named by
 * `data.titleParam` (e.g. the site slug); routes without either get just « Fleet ».
 * The title is reactive: it waits for the catalog (HTTP loader) and follows
 * language switches, so the raw key is never shown.
 */
@Injectable({ providedIn: 'root' })
export class FleetTitleStrategy extends TitleStrategy implements OnDestroy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private sub?: Subscription;

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.sub?.unsubscribe();
    let route = snapshot.root;
    let key: string | undefined;
    let param: string | undefined;
    while (route) {
      key = (route.data?.['titleKey'] as string | undefined) ?? key;
      const paramName = route.data?.['titleParam'] as string | undefined;
      if (paramName) param = route.paramMap.get(paramName) ?? param;
      route = route.firstChild as typeof route;
    }
    if (param) {
      this.title.setTitle(`${param} — ${APP_NAME}`);
      return;
    }
    if (!key) {
      this.title.setTitle(APP_NAME);
      return;
    }
    const titleKey = key;
    this.sub = this.transloco.langChanges$
      .pipe(switchMap((lang) => this.transloco.selectTranslate(titleKey, {}, lang)))
      .subscribe((page) => this.title.setTitle(`${page} — ${APP_NAME}`));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}
