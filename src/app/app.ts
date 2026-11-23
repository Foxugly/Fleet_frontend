import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from '@openng/optimus-ui/toast';
import { ConfirmDialogModule } from '@openng/optimus-ui/confirmdialog';
import { LanguageService } from './core/i18n/language.service';

/**
 * Root: the router outlet (layouts wrap the routes) plus the single global
 * <p-toast/> and <p-confirmdialog/> (fleet standard — one toast at the root).
 * The toast sits below the sticky topbar (`.fleet-toast` in styles.scss).
 * Injecting LanguageService initialises the active language at startup.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule, ConfirmDialogModule],
  template: `
    <router-outlet />
    <p-toast styleClass="fleet-toast" [breakpoints]="toastBreakpoints" />
    <p-confirmdialog />
  `,
})
export class App {
  // Eagerly construct the language service so i18n is applied before first paint.
  private readonly language = inject(LanguageService);

  /** Narrow screens: full width minus a 1rem gutter, so the toast never clips out of the viewport. */
  protected readonly toastBreakpoints = {
    '640px': { width: 'calc(100% - 2rem)', left: '1rem', right: '1rem' },
  };
}
