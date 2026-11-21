import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThemeService } from '../../theme/theme.service';
import { LanguageSwitcherComponent } from '../../i18n/language-switcher/language-switcher.component';
import { UserMenuComponent } from '../user-menu/user-menu.component';

interface NavLink {
  label: string;
  icon: string;
  link: string;
  exact?: boolean;
}

/**
 * Fleet-standard topmenu (STANDARD-frontend-layout.md §Topmenu): 3 zones
 * (brand / nav / actions), `[mode]` public|authenticated, borderless action
 * triggers (theme → language → user) and a
 * responsive hamburger drawer below 1024px. SNAPSHOT of FoxRunner_frontend,
 * with Fleet's nav (overview, box).
 */
@Component({
  selector: 'app-topmenu',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, TooltipModule, TranslocoPipe, LanguageSwitcherComponent, UserMenuComponent],
  templateUrl: './topmenu.component.html',
  styleUrl: './topmenu.component.scss',
})
export class TopmenuComponent {
  readonly theme = inject(ThemeService);
  readonly menuOpen = signal(false);

  /** Fleet-standard chrome mode; drives which nav (public vs app) is shown. */
  readonly mode = input<'public' | 'authenticated'>('authenticated');

  /** Brand target: login for guests, the app for the authenticated shell. */
  readonly brandLink = computed(() => (this.mode() === 'public' ? '/login' : '/'));

  /** No public nav (Fleet has no public pages); authenticated nav = overview + box. */
  readonly links = computed<NavLink[]>(() =>
    this.mode() === 'public'
      ? []
      : [
          { label: 'chrome.nav.overview', icon: 'pi pi-th-large', link: '/', exact: true },
          { label: 'chrome.nav.box', icon: 'pi pi-server', link: '/box' },
        ],
  );

  toggleMenu(): void {
    this.menuOpen.update((v) => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }
}
