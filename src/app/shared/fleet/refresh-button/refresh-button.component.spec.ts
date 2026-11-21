import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MessageService } from 'primeng/api';

import { provideApi } from '../../../api';
import { authTestProviders } from '../../../features/auth/auth-test-setup.testing';
import { RefreshButtonComponent } from './refresh-button.component';

async function setup() {
  TestBed.configureTestingModule({
    providers: [...authTestProviders(), provideApi({ basePath: 'http://api.test' }), MessageService],
  });
  const add = vi.spyOn(TestBed.inject(MessageService), 'add');
  const fixture: ComponentFixture<RefreshButtonComponent> = TestBed.createComponent(RefreshButtonComponent);
  fixture.componentRef.setInput('source', 'github');
  const queued = vi.fn();
  fixture.componentInstance.queued.subscribe(queued);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const http = TestBed.inject(HttpTestingController);
  const button = () => (fixture.nativeElement as HTMLElement).querySelector('button')!;
  return { fixture, http, add, queued, button };
}

describe('RefreshButtonComponent', () => {
  afterEach(() => vi.useRealTimers());

  it('is icon-only with a translated aria-label', async () => {
    const { button } = await setup();
    expect(button().getAttribute('aria-label')).toBe('Relancer la collecte');
    expect(button().textContent!.trim()).toBe('');
  });

  it('POSTs once, toasts « Collecte lancée », emits queued and disables for 60 s', async () => {
    const { fixture, http, add, queued, button } = await setup();
    button().click();
    button().click(); // double click while in flight
    const req = http.expectOne((r) => r.url === 'http://api.test/api/v1/refresh/github/');
    expect(req.request.method).toBe('POST');
    vi.useFakeTimers();
    req.flush({ queued: 'github' });
    fixture.detectChanges();
    expect(add).toHaveBeenCalledTimes(1);
    expect(add.mock.calls[0][0]).toMatchObject({ severity: 'success', summary: 'Collecte lancée' });
    expect(queued).toHaveBeenCalledTimes(1);
    expect(button().disabled).toBe(true);

    button().click();
    http.expectNone((r) => r.url.includes('/refresh/'));

    vi.advanceTimersByTime(59_000);
    fixture.detectChanges();
    expect(button().disabled).toBe(true);
    vi.advanceTimersByTime(1_000);
    fixture.detectChanges();
    expect(button().disabled).toBe(false);
  });

  it('already_queued: toasts « Déjà en cours » and still disables', async () => {
    const { fixture, http, add, button } = await setup();
    button().click();
    http.expectOne((r) => r.url.includes('/refresh/github/')).flush({ queued: 'github', already_queued: true });
    fixture.detectChanges();
    expect(add.mock.calls[0][0]).toMatchObject({ severity: 'info', summary: 'Déjà en cours' });
    expect(button().disabled).toBe(true);
  });

  it('failure: error toast, no queued event, button stays usable', async () => {
    const { fixture, http, add, queued, button } = await setup();
    button().click();
    http.expectOne((r) => r.url.includes('/refresh/github/')).flush({}, { status: 500, statusText: 'x' });
    fixture.detectChanges();
    expect(add.mock.calls[0][0]).toMatchObject({ severity: 'error' });
    expect(queued).not.toHaveBeenCalled();
    expect(button().disabled).toBe(false);
  });
});
