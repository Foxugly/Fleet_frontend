import { TestBed } from '@angular/core/testing';

import { authTestProviders } from '../../../features/auth/auth-test-setup.testing';
import { TopmenuComponent } from './topmenu.component';

async function render(mode: 'public' | 'authenticated'): Promise<HTMLElement> {
  TestBed.configureTestingModule({ providers: [...authTestProviders()] });
  const fixture = TestBed.createComponent(TopmenuComponent);
  fixture.componentRef.setInput('mode', mode);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('TopmenuComponent', () => {
  it('public mode shows no « Se connecter » link (the page already is the login)', async () => {
    const el = await render('public');
    expect(el.querySelector('app-user-menu')).toBeNull();
    expect(el.querySelector('.user-signin')).toBeNull();
  });

  it('authenticated mode keeps the user menu', async () => {
    const el = await render('authenticated');
    expect(el.querySelector('app-user-menu')).not.toBeNull();
  });

  it('authenticated nav links the inventory (« Inventaire » → /apps)', async () => {
    const el = await render('authenticated');
    const link = el.querySelector<HTMLAnchorElement>('.topbar__nav a[href="/apps"]');
    expect(link).not.toBeNull();
    expect(link!.textContent).toContain('Inventaire');
  });
});
