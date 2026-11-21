import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthCardComponent } from '../../../shared/components/auth-card/auth-card.component';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * Login card (auth-card, username, p-password, remember-me, emerald submit).
 * Fleet is single-operator: no register, forgot-password or magic link (the
 * documented exception to the auth-page standard). The password step hands
 * off to /mfa (AuthService.pendingMfa); Task 5 completes this page.
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
    PasswordModule,
    AuthCardComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
    rememberMe: [true],
  });

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { username, password, rememberMe } = this.form.getRawValue();
    // Minimal until Task 5 rewrites this page (errors, returnUrl, /mfa form).
    this.auth.login(username, password, rememberMe).subscribe(() => void this.router.navigate(['/mfa']));
  }
}
