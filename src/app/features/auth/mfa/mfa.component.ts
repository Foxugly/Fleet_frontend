import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../../core/auth/auth.service';
import { MfaSetup } from '../../../core/auth/auth.models';
import { AuthCardComponent } from '../../../shared/components/auth-card/auth-card.component';
import { LoginReason, MfaFailure, mfaFailure, safeReturnUrl } from '../auth-flow';

type Mode = 'verify' | 'setup';

/**
 * Second factor (mandatory TOTP), two modes taken from the password step's
 * hand-off (`AuthService.pendingMfa`, memory only; `mfaPendingGuard` keeps the
 * page unreachable without it):
 * - verify: a 6-digit code or a recovery code signs in;
 * - setup: QR + secret + first code (signs in), then the recovery codes, shown
 *   once, and « Continuer » stays disabled until the user ticks they saved them.
 */
@Component({
  selector: 'app-mfa',
  standalone: true,
  imports: [ReactiveFormsModule, TranslocoPipe, ButtonModule, CheckboxModule, InputTextModule, MessageModule, AuthCardComponent],
  templateUrl: './mfa.component.html',
  styleUrl: './mfa.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class MfaComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);

  // Snapshot of the hand-off: confirming clears `pendingMfa`, the view must not flip.
  private readonly step = this.auth.pendingMfa();
  private readonly token = this.step?.mfaToken ?? '';
  protected readonly mode: Mode = this.step?.kind ?? 'verify';

  protected readonly form = this.fb.nonNullable.group({ code: ['', Validators.required] });
  protected readonly ack = this.fb.nonNullable.control(false);

  protected readonly loading = signal(false);
  protected readonly errorKey = signal<string | null>(null);
  protected readonly setup = signal<MfaSetup | null>(null);
  protected readonly recoveryCodes = signal<string[] | null>(null);
  protected readonly copied = signal<'secret' | 'codes' | null>(null);
  /** Set when a navigation was refused: shows the (un-dismissable) reminder. */
  protected readonly leaveBlocked = signal(false);

  /** `qrSvg` is a server-built `data:` URI; anything else is never bound to the <img>. */
  protected readonly qrSrc = computed(() => {
    const qr = this.setup()?.qrSvg;
    return qr?.startsWith('data:image/svg+xml') ? qr : null;
  });

  ngOnInit(): void {
    if (this.mode !== 'setup') return;
    this.auth.mfaSetup(this.token).subscribe({
      next: (setup) => this.setup.set(setup),
      error: (err: unknown) => this.fail(mfaFailure(err)),
    });
  }

  protected submit(): void {
    const code = this.form.controls.code.value.trim();
    if (!code || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    this.errorKey.set(null);
    this.loading.set(true);
    if (this.mode === 'setup') {
      this.auth.mfaConfirm(this.token, code).subscribe({
        next: (res) => {
          this.loading.set(false);
          this.recoveryCodes.set(res.recoveryCodes);
        },
        error: (err: unknown) => this.fail(mfaFailure(err)),
      });
    } else {
      this.auth.mfaVerify(this.token, code).subscribe({
        next: () => this.finish(),
        error: (err: unknown) => this.fail(mfaFailure(err)),
      });
    }
  }

  /** Router `canDeactivate`: free unless unacknowledged recovery codes are on screen. */
  canLeave(): boolean {
    if (this.recoveryCodes() && !this.ack.value) {
      this.leaveBlocked.set(true);
      return false;
    }
    return true;
  }

  protected finish(): void {
    if (this.recoveryCodes() && !this.ack.value) return;
    void this.router.navigateByUrl(safeReturnUrl(this.route.snapshot.queryParamMap.get('returnUrl')));
  }

  protected copySecret(): void {
    this.copy(this.setup()?.secret ?? '', 'secret');
  }

  protected copyCodes(): void {
    this.copy((this.recoveryCodes() ?? []).join('\n'), 'codes');
  }

  /** The recovery codes exist only in memory: warn before a reload loses them. */
  protected onBeforeUnload(event: Event): void {
    if (this.recoveryCodes() && !this.ack.value) event.preventDefault();
  }

  private copy(text: string, what: 'secret' | 'codes'): void {
    void navigator.clipboard?.writeText(text).then(
      () => this.copied.set(what),
      () => undefined,
    );
  }

  private fail(failure: MfaFailure): void {
    this.loading.set(false);
    if (failure.restart) {
      this.auth.clearSession();
      this.goToLogin(failure.restart);
      return;
    }
    this.errorKey.set(failure.key);
  }

  private goToLogin(reason: LoginReason): void {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    void this.router.navigate(['/login'], { queryParams: { ...(returnUrl ? { returnUrl } : {}), reason } });
  }
}
