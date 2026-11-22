import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { MessageService } from 'primeng/api';

import { authTestProviders } from '../auth/auth-test-setup.testing';
import { AppFormComponent } from './app-form.component';
import { appOut, isApp } from './apps-test-data.testing';

@Component({ template: '' })
class Stub {}

async function setup(url: string) {
  TestBed.configureTestingModule({
    providers: [
      ...authTestProviders([
        { path: 'apps/new', component: AppFormComponent },
        { path: 'apps/:slug/edit', component: AppFormComponent },
        { path: '**', component: Stub },
      ]),
      MessageService,
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, AppFormComponent);
  const http = TestBed.inject(HttpTestingController);
  const settle = async () => {
    harness.fixture.detectChanges();
    await harness.fixture.whenStable();
    harness.fixture.detectChanges();
  };
  return {
    harness,
    http,
    settle,
    el: harness.routeNativeElement as HTMLElement,
    router: TestBed.inject(Router),
    messages: TestBed.inject(MessageService),
  };
}

async function edit(slug = 'poker') {
  const s = await setup(`/apps/${slug}/edit`);
  s.http.expectOne(isApp(slug)).flush(appOut(slug));
  await s.settle();
  return s;
}

const field = (el: HTMLElement, name: string) => el.querySelector<HTMLElement>(`[data-field="${name}"]`)!;
const chips = (el: HTMLElement, name: string) =>
  Array.from(field(el, name).querySelectorAll('.p-autocomplete-chip-item')).map((c) => c.textContent!.trim());
const codeInput = () => document.body.querySelector<HTMLInputElement>('.totp-dialog__code');
const dialogOpen = () => !!codeInput();

async function typeChip(el: HTMLElement, name: string, value: string, settle: () => Promise<void>) {
  const input = field(el, name).querySelector<HTMLInputElement>('input')!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
  await settle();
}

async function save(el: HTMLElement, settle: () => Promise<void>) {
  el.querySelector<HTMLButtonElement>('.app-form__save button, button.app-form__save')!.click();
  await settle();
}

async function enterCode(settle: () => Promise<void>, code = '123456') {
  codeInput()!.value = code;
  codeInput()!.dispatchEvent(new Event('input'));
  await settle();
  document.body.querySelector<HTMLButtonElement>('.totp-dialog__confirm button, button.totp-dialog__confirm')!.click();
  await settle();
}

describe('AppFormComponent', () => {
  describe('edit', () => {
    it('shows every field, list fields as chips, the slug read-only', async () => {
      const { el } = await edit();
      const slug = field(el, 'slug').querySelector<HTMLInputElement>('input')!;
      expect(slug.value).toBe('poker');
      expect(slug.readOnly).toBe(true);
      expect(chips(el, 'repos')).toEqual(['Foxugly/Poker_server', 'Foxugly/Poker_frontend']);
      expect(chips(el, 'vhosts')).toEqual(['poker.foxugly.com']);
      expect(chips(el, 'sentry_projects')).toEqual(['poker-backend']);
      expect(chips(el, 'python_locks')).toEqual(['Foxugly/Poker_server:requirements.txt']);
      expect(chips(el, 'npm_locks')).toEqual(['Foxugly/Poker_frontend:package-lock.json']);
      expect(field(el, 'health_path').querySelector<HTMLInputElement>('input')!.value).toBe('/health/');
      expect(field(el, 'deployed').querySelector<HTMLInputElement>('input')!.checked).toBe(true);
      expect(field(el, 'actions_allowed').querySelector<HTMLInputElement>('input')!.checked).toBe(false);
    });

    it('explains under the repos that the fleet-read token must cover them', async () => {
      const { el } = await edit();
      expect(field(el, 'repos').textContent).toContain('Le token GitHub « fleet-read » doit couvrir ce dépôt');
    });

    it('flags, client-side, a lock whose repo is not listed and does not open the code dialog', async () => {
      const { el, settle, http } = await edit();
      await typeChip(el, 'python_locks', 'Foxugly/Other:requirements.txt', settle);
      expect(chips(el, 'python_locks')).toContain('Foxugly/Other:requirements.txt');
      expect(field(el, 'python_locks').textContent).toContain('Foxugly/Other');
      expect(field(el, 'python_locks').textContent).toContain("n'est pas dans les dépôts");
      await save(el, settle);
      expect(dialogOpen()).toBe(false);
      http.expectNone(() => true);
    });

    it('saving opens the code dialog, then PUTs the fields with totp_code (no slug), toasts and goes back to the list', async () => {
      const { el, settle, http, router, messages } = await edit();
      const toast = vi.spyOn(messages, 'add');
      const nav = vi.spyOn(router, 'navigateByUrl');
      await typeChip(el, 'vhosts', 'poker2.foxugly.com', settle);
      await save(el, settle);
      expect(dialogOpen()).toBe(true);
      http.expectNone(isApp('poker', 'PUT'));
      await enterCode(settle);
      const req = http.expectOne(isApp('poker', 'PUT'));
      expect(req.request.body).toEqual({
        repos: ['Foxugly/Poker_server', 'Foxugly/Poker_frontend'],
        vhosts: ['poker.foxugly.com', 'poker2.foxugly.com'],
        health_path: '/health/',
        sentry_projects: ['poker-backend'],
        python_locks: ['Foxugly/Poker_server:requirements.txt'],
        npm_locks: ['Foxugly/Poker_frontend:package-lock.json'],
        deployed: true,
        actions_allowed: false,
        totp_code: '123456',
      });
      req.flush(appOut('poker'));
      await settle();
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ severity: 'success' }));
      expect(nav).toHaveBeenCalledWith('/apps');
    });

    it('a 403 keeps the dialog open with the error and the form data intact (Review Focus 5)', async () => {
      const { el, settle, http } = await edit();
      await typeChip(el, 'vhosts', 'poker2.foxugly.com', settle);
      await save(el, settle);
      await enterCode(settle, '000000');
      http.expectOne(isApp('poker', 'PUT')).flush({ code: 'totp_invalid' }, { status: 403, statusText: 'Forbidden' });
      await settle();
      expect(dialogOpen()).toBe(true);
      expect(document.body.querySelector('.totp-dialog__error')!.textContent).toContain('Code invalide');
      expect(codeInput()!.value).toBe('');
      expect(chips(el, 'vhosts')).toEqual(['poker.foxugly.com', 'poker2.foxugly.com']);
    });

    it('a network failure keeps the dialog open with the error and the data (Review Focus 5)', async () => {
      const { el, settle, http } = await edit();
      await typeChip(el, 'vhosts', 'poker2.foxugly.com', settle);
      await save(el, settle);
      await enterCode(settle);
      http.expectOne(isApp('poker', 'PUT')).error(new ProgressEvent('error'), { status: 0, statusText: '' });
      await settle();
      expect(dialogOpen()).toBe(true);
      expect(document.body.querySelector('.totp-dialog__error')!.textContent).toContain('Service indisponible');
      expect(chips(el, 'vhosts')).toContain('poker2.foxugly.com');
      // Retrying sends the same data with the new code.
      await enterCode(settle, '654321');
      const retry = http.expectOne(isApp('poker', 'PUT'));
      expect(retry.request.body.vhosts).toContain('poker2.foxugly.com');
      expect(retry.request.body.totp_code).toBe('654321');
    });

    it('a 400 closes the dialog and shows each error under its field (Review Focus 4)', async () => {
      const { el, settle, http } = await edit();
      await save(el, settle);
      await enterCode(settle);
      http
        .expectOne(isApp('poker', 'PUT'))
        .flush({ npm_locks: ["Invalid lock: 'x'."], slug: ['The slug cannot be changed.'] }, { status: 400, statusText: 'Bad Request' });
      await settle();
      expect(dialogOpen()).toBe(false);
      expect(field(el, 'npm_locks').textContent).toContain("Invalid lock: 'x'.");
      expect(field(el, 'slug').textContent).toContain('The slug cannot be changed.');
      expect(el.querySelector('.app-form__summary')!.textContent).toContain('erreurs');
    });

    it('shows an empty state for an unknown slug', async () => {
      const s = await setup('/apps/ghost/edit');
      s.http.expectOne(isApp('ghost')).flush({ detail: 'Not found.' }, { status: 404, statusText: 'Not Found' });
      await s.settle();
      expect(s.el.querySelector('app-empty-state')).not.toBeNull();
    });
  });

  describe('create', () => {
    it('the slug is editable and the POST carries it with the code', async () => {
      const { el, settle, http } = await setup('/apps/new');
      await settle();
      const slug = field(el, 'slug').querySelector<HTMLInputElement>('input')!;
      expect(slug.readOnly).toBe(false);
      slug.value = 'chess';
      slug.dispatchEvent(new Event('input'));
      await typeChip(el, 'repos', 'Foxugly/foxChess', settle);
      await save(el, settle);
      await enterCode(settle);
      const req = http.expectOne((r) => r.url.endsWith('/api/v1/apps/') && r.method === 'POST');
      expect(req.request.body).toEqual(
        expect.objectContaining({ slug: 'chess', repos: ['Foxugly/foxChess'], health_path: '/health/', totp_code: '123456' }),
      );
    });

    it('an invalid slug is flagged before any code is asked', async () => {
      const { el, settle } = await setup('/apps/new');
      await settle();
      await save(el, settle);
      expect(dialogOpen()).toBe(false);
      expect(field(el, 'slug').querySelector('.meta-hint--error')).not.toBeNull();
    });
  });
});
