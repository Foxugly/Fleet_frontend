import { Routes } from '@angular/router';
import { authGuard, mfaPendingGuard } from './core/auth/auth.guard';
import { mfaLeaveGuard } from './features/auth/mfa/mfa-leave.guard';
import { MainLayoutComponent } from './core/layout/main-layout/main-layout.component';
import { PublicLayoutComponent } from './core/layout/public-layout/public-layout.component';

// Placeholders until Tasks 6-9 replace them.
const placeholder = () =>
  import('./features/placeholder/placeholder.component').then((m) => m.PlaceholderComponent);

export const routes: Routes = [
  // Authenticated area (main-layout, topmenu mode="authenticated")
  {
    path: '',
    canActivate: [authGuard],
    component: MainLayoutComponent,
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/overview/overview.component').then((m) => m.OverviewComponent),
        data: { titleKey: 'overview.title' },
      },
      { path: 'sites/:slug', loadComponent: placeholder, data: { titleKey: 'site.title' } },
      { path: 'box', loadComponent: placeholder, data: { titleKey: 'box.title' } },
    ],
  },

  // Public / auth area (public-layout, topmenu mode="public")
  {
    path: '',
    component: PublicLayoutComponent,
    children: [
      {
        path: 'login',
        data: { titleKey: 'login.title' },
        loadComponent: () =>
          import('./features/auth/login/login.component').then((m) => m.LoginComponent),
      },
      {
        path: 'mfa',
        canActivate: [mfaPendingGuard],
        canDeactivate: [mfaLeaveGuard],
        data: { titleKey: 'mfa.title' },
        loadComponent: () => import('./features/auth/mfa/mfa.component').then((m) => m.MfaComponent),
      },
    ],
  },

  { path: '**', redirectTo: '' },
];
