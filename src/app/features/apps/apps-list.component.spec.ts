import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';

import { authTestProviders } from '../auth/auth-test-setup.testing';
import { AppsListComponent } from './apps-list.component';
import { appOut, isApps } from './apps-test-data.testing';

@Component({ template: '' })
class Stub {}

async function setup() {
  TestBed.configureTestingModule({
    providers: [
      ...authTestProviders([
        { path: 'apps', component: AppsListComponent },
        { path: '**', component: Stub },
      ]),
      MessageService,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/apps', AppsListComponent);
  const http = TestBed.inject(HttpTestingController);
  const settle = async () => {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  };
  return { harness, http, settle, el: harness.routeNativeElement as HTMLElement, messages: TestBed.inject(MessageService) };
}

const rows = (el: HTMLElement) => Array.from(el.querySelectorAll('.apps-list__row')) as HTMLElement[];
const codeInput = () => document.body.querySelector<HTMLInputElement>('.totp-dialog__code')!;

async function enterCode(settle: () => Promise<void>, code = '123456') {
  codeInput().value = code;
  codeInput().dispatchEvent(new Event('input'));
  await settle();
  document.body.querySelector<HTMLButtonElement>('.totp-dialog__confirm button, button.totp-dialog__confirm')!.click();
  await settle();
}

describe('AppsListComponent', () => {
  it('lists the active apps with edit and history links, archived ones hidden', async () => {
    const { http, settle, el } = await setup();
    http.expectOne(isApps).flush([appOut('poker'), appOut('billing'), appOut('old', { archived: true, archived_at: '2026-11-01T00:00:00Z' })]);
    await settle();
    expect(el.querySelector('h1')!.textContent).toContain('Inventaire');
    expect(rows(el).map((r) => r.querySelector('.apps-list__name')!.textContent!.trim())).toEqual(['billing', 'poker']);
    const poker = rows(el)[1];
    expect(poker.querySelector('a[href="/apps/poker/edit"]')).not.toBeNull();
    expect(poker.querySelector('a[href="/apps/poker/history"]')).not.toBeNull();
    expect(el.querySelector('a[href="/apps/new"]')).not.toBeNull();
    expect(el.textContent).not.toContain('Restaurer');
  });

  it('« Voir les archivées » reveals the archived apps with « Restaurer »', async () => {
    const { http, settle, el } = await setup();
    http.expectOne(isApps).flush([appOut('poker'), appOut('old', { archived: true })]);
    await settle();
    expect(el.textContent).toContain('Voir les archivées');
    el.querySelector<HTMLInputElement>('#apps-show-archived')!.click();
    await settle();
    const old = rows(el).find((r) => r.textContent!.includes('old'))!;
    expect(old.textContent).toContain('Archivée');
    expect(old.textContent).toContain('Restaurer');
  });

  it('archiving asks for the code, posts it and updates the row with a toast', async () => {
    const { http, settle, el, messages } = await setup();
    const toast = vi.spyOn(messages, 'add');
    http.expectOne(isApps).flush([appOut('poker')]);
    await settle();
    rows(el)[0].querySelector<HTMLButtonElement>('.apps-list__archive button, button.apps-list__archive')!.click();
    await settle();
    http.expectNone(() => true);
    await enterCode(settle);
    const req = http.expectOne((r) => r.url.endsWith('/api/v1/apps/poker/archive/'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ totp_code: '123456' });
    req.flush(appOut('poker', { archived: true }));
    await settle();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
    expect(rows(el)).toHaveLength(0);
  });

  it('a refused code keeps the dialog open with the error, cleared input', async () => {
    const { http, settle, el } = await setup();
    http.expectOne(isApps).flush([appOut('poker')]);
    await settle();
    rows(el)[0].querySelector<HTMLButtonElement>('.apps-list__archive button, button.apps-list__archive')!.click();
    await settle();
    await enterCode(settle, '000000');
    http.expectOne((r) => r.url.endsWith('/archive/')).flush({ code: 'totp_invalid' }, { status: 403, statusText: 'Forbidden' });
    await settle();
    expect(document.body.querySelector('.totp-dialog__error')!.textContent).toContain('Code invalide');
    expect(codeInput().value).toBe('');
  });

  it('restoring an archived app posts the code to restore/', async () => {
    const { http, settle, el } = await setup();
    http.expectOne(isApps).flush([appOut('old', { archived: true })]);
    await settle();
    el.querySelector<HTMLInputElement>('#apps-show-archived')!.click();
    await settle();
    rows(el)[0].querySelector<HTMLButtonElement>('.apps-list__restore button, button.apps-list__restore')!.click();
    await settle();
    await enterCode(settle);
    const req = http.expectOne((r) => r.url.endsWith('/api/v1/apps/old/restore/'));
    expect(req.request.body).toEqual({ totp_code: '123456' });
    req.flush(appOut('old'));
    await settle();
    expect(rows(el)[0].textContent).not.toContain('Archivée');
  });

  it('shows an empty state without apps and an error message when the load fails', async () => {
    const { http, settle, el } = await setup();
    http.expectOne(isApps).flush([]);
    await settle();
    expect(el.querySelector('app-empty-state')).not.toBeNull();
  });
});
