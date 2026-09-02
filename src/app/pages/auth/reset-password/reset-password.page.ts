import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MIN_RESET_PASSWORD_LENGTH, UserAuthService, describePortalError } from '../../../core';
import { passwordsMatch } from '../password-match.validator';

@Component({
  selector: 'app-reset-password',
  templateUrl: './reset-password.page.html',
  styleUrls: ['./reset-password.page.scss'],
  standalone: false,
})
export class ResetPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(UserAuthService);

  readonly minLength = MIN_RESET_PASSWORD_LENGTH;

  /**
   * The token comes from the emailed link's query string.
   *
   * It is also an editable field, and deliberately so: an emailed link opens the
   * device's browser, not this app, until Android App Links and iOS Universal
   * Links are configured. Until then, pasting the token is the only way a phone
   * can complete this.
   */
  readonly form = this.fb.nonNullable.group(
    {
      token: [this.route.snapshot.queryParamMap.get('token') ?? '', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(MIN_RESET_PASSWORD_LENGTH)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch('password', 'confirmPassword') },
  );

  showPassword = false;
  isLoading = false;
  isReset = false;
  errorMessage = '';

  get hasMismatch(): boolean {
    return this.form.hasError('passwordMismatch') && (this.form.get('confirmPassword')?.touched ?? false);
  }

  async resetPassword(): Promise<void> {
    if (this.form.invalid || this.isLoading) return;

    this.errorMessage = '';
    this.isLoading = true;

    const { token, password } = this.form.getRawValue();

    try {
      await this.auth.completePasswordReset(token.trim(), password);

      // No session comes back, on purpose: redeeming a link revokes every
      // refresh token the account holds, and handing back a fresh one would undo
      // the revocation for whoever redeemed it. Signing in again is also a check
      // that they know the password they just set.
      this.isReset = true;
    } catch (error) {
      // Unknown, expired and already-used tokens are refused identically — a
      // per-reason message would confirm the token was real.
      this.errorMessage = describePortalError(
        error,
        'That reset link is no longer valid. Request a new one.',
      );
    } finally {
      this.isLoading = false;
    }
  }
}
