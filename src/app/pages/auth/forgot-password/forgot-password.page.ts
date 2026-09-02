import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { UserAuthService, describePortalError } from '../../../core';

@Component({
  selector: 'app-forgot-password',
  templateUrl: './forgot-password.page.html',
  styleUrls: ['./forgot-password.page.scss'],
  standalone: false,
})
export class ForgotPasswordPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(UserAuthService);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  isLoading = false;
  isSent = false;
  errorMessage = '';

  async requestReset(): Promise<void> {
    if (this.form.invalid || this.isLoading) return;

    this.errorMessage = '';
    this.isLoading = true;

    try {
      await this.auth.requestPasswordReset(this.form.getRawValue().email.trim());

      // The API answers identically whether or not the account exists, and this
      // screen must not undo that by branching. Anything that distinguished the
      // two — a different message, a different delay — would be the account
      // enumeration oracle the fixed response exists to prevent.
      this.isSent = true;
    } catch (error) {
      // Only a genuine failure lands here: a throttle, or the server being
      // unreachable. An unknown address is still a success.
      this.errorMessage = describePortalError(error, 'Could not send the link. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }
}
