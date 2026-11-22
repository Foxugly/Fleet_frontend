import { ChangeDetectionStrategy, Component, input, model, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

const CODE_RE = /^\d{6}$/;

/**
 * Step-up dialog for an inventory write: asks the 6-digit TOTP code and emits it.
 * The code lives only in this component and is cleared after every attempt (a
 * refused code is never re-sent); it is never logged or stored. The parent keeps
 * the dialog open and passes `errorKey` when the attempt fails.
 */
@Component({
  selector: 'app-totp-dialog',
  imports: [TranslocoPipe, ButtonModule, DialogModule, InputTextModule, MessageModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="'apps.totp.title' | transloco"
      [visible]="visible()"
      (visibleChange)="onVisibleChange($event)"
      [modal]="true"
      [closable]="!busy()"
      [draggable]="false"
      [resizable]="false"
      [style]="{ width: '24rem', maxWidth: 'calc(100vw - 2rem)' }"
    >
      <form class="totp-dialog" (submit)="$event.preventDefault(); confirm()">
        <p class="totp-dialog__intro">{{ 'apps.totp.intro' | transloco }}</p>
        @if (errorKey(); as key) {
          <p-message class="totp-dialog__error" severity="error" [text]="key | transloco" role="alert" />
        }
        <label class="meta-label" for="totp-dialog-code">{{ 'apps.totp.code' | transloco }}</label>
        <input
          pInputText
          id="totp-dialog-code"
          class="totp-dialog__code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="6"
          spellcheck="false"
          [value]="code()"
          (input)="code.set($any($event.target).value.trim())"
          [attr.aria-invalid]="errorKey() ? true : null"
        />
        <div class="totp-dialog__actions">
          <p-button
            class="totp-dialog__cancel"
            type="button"
            severity="secondary"
            [text]="true"
            [label]="'common.cancel' | transloco"
            [disabled]="busy()"
            (onClick)="close()"
          />
          <p-button
            class="totp-dialog__confirm"
            type="submit"
            icon="pi pi-check"
            [label]="'apps.totp.confirm' | transloco"
            [loading]="busy()"
            [disabled]="!valid() || busy()"
          />
        </div>
      </form>
    </p-dialog>
  `,
  styles: `
    .totp-dialog {
      display: grid;
      gap: 0.6rem;
    }
    .totp-dialog__intro {
      margin: 0;
      font-size: 0.9rem;
      color: var(--muted);
    }
    .totp-dialog__code {
      width: 100%;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      letter-spacing: 0.2em;
    }
    .totp-dialog__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.5rem;
      margin-top: 0.4rem;
    }
  `,
})
export class TotpDialogComponent {
  readonly visible = model(false);
  readonly busy = input(false);
  readonly errorKey = input<string | null>(null);
  readonly confirmed = output<string>();

  protected readonly code = signal('');

  protected valid(): boolean {
    return CODE_RE.test(this.code());
  }

  protected confirm(): void {
    if (!this.valid() || this.busy()) return;
    const code = this.code();
    this.code.set('');
    this.confirmed.emit(code);
  }

  protected close(): void {
    this.code.set('');
    this.visible.set(false);
  }

  protected onVisibleChange(open: boolean): void {
    if (!open) this.close();
  }
}
