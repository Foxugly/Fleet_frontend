import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTransloco } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { App } from './app';
import { MainLayoutComponent } from './core/layout/main-layout/main-layout.component';
import { TranslocoHttpLoader } from './core/i18n/transloco-loader';

const providers = [
  provideHttpClient(),
  provideHttpClientTesting(),
  MessageService,
  ConfirmationService,
  provideTransloco({
    config: { availableLangs: ['fr', 'en'], defaultLang: 'fr' },
    loader: TranslocoHttpLoader,
  }),
];

describe('App', () => {
  it('renders the shell', async () => {
    TestBed.configureTestingModule({
      providers: [...providers, provideRouter([{ path: '', component: MainLayoutComponent, children: [] }])],
    });
    const fixture = TestBed.createComponent(App);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    expect(root.querySelector('router-outlet')).not.toBeNull();
    // The authenticated shell renders the topmenu next to its own outlet.
    expect(root.querySelector('app-topmenu')).not.toBeNull();
  });
});
