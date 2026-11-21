import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { AuthCardComponent } from '../../../shared/components/auth-card/auth-card.component';
import { AuthService } from '../../../core/auth/auth.service';
import { LOGIN_REASON_KEYS, LoginReason, loginErrorKey } from '../auth-flow';

/**
 * Login card (auth-card, username, p-password, remember-me, emerald submit).
 * Fleet is single-operator: no register, forgot-password or magic link (the
 * documented exception to the auth-page standard). The password step hands
 * off to /mfa (AuthService.pendingMfa), carrying `returnUrl` along.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    TranslocoPipe,
    ButtonModule,
    CheckboxModule,
    InputTextModule,
    MessageModule,
    PasswordModule,
    AuthCardComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
    rememberMe: [true],
  });

  protected readonly loading = signal(false);
  private readonly failure = signal<string | null>(null);

  /** Failure of the last attempt, else the notice handed back by the MFA page. */
  protected readonly errorKey = computed(() => {
    const failure = this.failure();
    if (failure) return failure;
    const reason = this.route.snapshot.queryParamMap.get('reason');
    return reason !== null && Object.hasOwn(LOGIN_REASON_KEYS, reason)
      ? LOGIN_REASON_KEYS[reason as LoginReason]
      : null;
  });

  protected submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    const { username, password, rememberMe } = this.form.getRawValue();
    this.failure.set(null);
    this.loading.set(true);
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    this.auth.login(username, password, rememberMe).subscribe({
      next: () =>
        void this.router.navigate(['/mfa'], { queryParams: returnUrl ? { returnUrl } : undefined }),
      error: (err: unknown) => {
        this.loading.set(false);
        this.failure.set(loginErrorKey(err));
      },
    });
  }
}
