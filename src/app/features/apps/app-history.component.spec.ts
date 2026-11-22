import { HttpTestingController } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterTestingHarness } from '@angular/router/testing';

import { AppChange } from '../../api';
import { authTestProviders } from '../auth/auth-test-setup.testing';
import { AppHistoryComponent } from './app-history.component';

@Component({ template: '' })
class Stub {}

const fields = { slug: 'poker', repos: ['Foxugly/Poker_server'], vhosts: ['poker.foxugly.com'], health_path: '/health/', deployed: true, archived: false };

async function setup(changes: AppChange[] | null) {
  TestBed.configureTestingModule({
    providers: [
      ...authTestProviders([
        { path: 'apps/:slug/history', component: AppHistoryComponent },
        { path: '**', component: Stub },
      ]),
    ],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl('/apps/poker/history', AppHistoryComponent);
  const http = TestBed.inject(HttpTestingController);
  const req = http.expectOne((r) => r.url.endsWith('/api/v1/apps/poker/changes/'));
  if (changes) req.flush(changes);
  else req.flush({}, { status: 500, statusText: 'Server Error' });
  harness.fixture.detectChanges();
  await harness.fixture.whenStable();
  harness.fixture.detectChanges();
  return harness.routeNativeElement as HTMLElement;
}

describe('AppHistoryComponent', () => {
  it('renders before → after for the changed fields only, newest first', async () => {
    const el = await setup([
      { at: '2026-11-22T12:00:00Z', user: 'renaud', action: 'archive', before: fields, after: { ...fields, archived: true } },
      { at: '2026-11-22T11:00:00Z', user: 'renaud', action: 'update', before: fields, after: { ...fields, vhosts: ['new.foxugly.com'] } },
    ]);
    const entries = Array.from(el.querySelectorAll('.app-history__entry')) as HTMLElement[];
    expect(entries).toHaveLength(2);
    expect(entries[0].textContent).toContain('Archivage');
    expect(entries[0].textContent).toContain('renaud');
    const archiveRows = entries[0].querySelectorAll('.app-history__change');
    expect(archiveRows).toHaveLength(1);
    expect(archiveRows[0].textContent).toContain('Archivée');
    expect(archiveRows[0].textContent).toContain('non');
    expect(archiveRows[0].textContent).toContain('oui');
    const updateRows = entries[1].querySelectorAll('.app-history__change');
    expect(updateRows).toHaveLength(1);
    expect(updateRows[0].textContent).toContain('poker.foxugly.com');
    expect(updateRows[0].textContent).toContain('new.foxugly.com');
    expect(updateRows[0].textContent).toContain('→');
    expect(el.textContent).not.toContain('/health/');
  });

  it('a creation shows the initial values', async () => {
    const el = await setup([{ at: '2026-11-22T11:00:00Z', user: null, action: 'create', before: null, after: fields }]);
    expect(el.textContent).toContain('Création');
    expect(el.querySelectorAll('.app-history__change').length).toBe(Object.keys(fields).length);
  });

  it('shows an empty state without changes and an error when the load fails', async () => {
    expect((await setup([])).querySelector('app-empty-state')).not.toBeNull();
    TestBed.resetTestingModule();
    expect((await setup(null)).querySelector('p-message')).not.toBeNull();
  });
});
