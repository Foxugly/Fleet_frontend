import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { authTestProviders } from '../auth/auth-test-setup.testing';
import { TotpDialogComponent } from './totp-dialog.component';

@Component({
  imports: [TotpDialogComponent],
  template: `<app-totp-dialog [(visible)]="open" [busy]="busy()" [errorKey]="error()" (confirmed)="codes.push($event)" />`,
})
class Host {
  readonly open = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly codes: string[] = [];
}

async function setup() {
  TestBed.configureTestingModule({ providers: [...authTestProviders()] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

const input = () => document.body.querySelector<HTMLInputElement>('.totp-dialog__code')!;
const confirmBtn = () => document.body.querySelector<HTMLButtonElement>('.totp-dialog__confirm button, button.totp-dialog__confirm')!;

function type(value: string) {
  input().value = value;
  input().dispatchEvent(new Event('input'));
}

describe('TotpDialogComponent', () => {
  it('shows a labelled one-time-code input', async () => {
    await setup();
    const el = input();
    expect(el).not.toBeNull();
    expect(el.getAttribute('autocomplete')).toBe('one-time-code');
    expect(document.body.querySelector(`label[for="${el.id}"]`)!.textContent).toContain('Code');
  });

  it('only a 6-digit code can be confirmed, and it is cleared after each attempt', async () => {
    const { fixture, host } = await setup();
    type('12a');
    fixture.detectChanges();
    expect(confirmBtn().disabled).toBe(true);
    type('123456');
    fixture.detectChanges();
    expect(confirmBtn().disabled).toBe(false);
    confirmBtn().click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.codes).toEqual(['123456']);
    expect(input().value).toBe('');
  });

  it('shows the error key it is given', async () => {
    const { fixture, host } = await setup();
    host.error.set('apps.totp.invalid');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.body.querySelector('.totp-dialog__error')!.textContent).toContain('Code invalide');
  });

  it('cancel closes the dialog without emitting', async () => {
    const { fixture, host } = await setup();
    type('123456');
    document.body.querySelector<HTMLButtonElement>('.totp-dialog__cancel button, button.totp-dialog__cancel')!.click();
    fixture.detectChanges();
    expect(host.open()).toBe(false);
    expect(host.codes).toEqual([]);
  });
});
