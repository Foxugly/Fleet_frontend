import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

const APP_NAME = 'Fleet';

/**
 * Page title « {page} — Fleet ». The page name comes from the route's
 * `data.titleKey` (a Transloco key); routes without one get just « Fleet ».
 */
@Injectable({ providedIn: 'root' })
export class FleetTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    let route = snapshot.root;
    let key: string | undefined;
    while (route) {
      key = (route.data?.['titleKey'] as string | undefined) ?? key;
      route = route.firstChild as typeof route;
    }
    this.title.setTitle(key ? `${this.transloco.translate(key)} — ${APP_NAME}` : APP_NAME);
  }
}
