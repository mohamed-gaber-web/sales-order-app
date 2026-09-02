import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import {
  MIN_INVITATION_PASSWORD_LENGTH,
  UserAuthService,
  describePortalError,
} from '../../../core';
import { passwordsMatch } from '../password-match.validator';

/**
 * Redeeming an invitation — the only way an account gets its first password.
 *
 * There is no self-service registration: an administrator issues an invitation
 * from the admin portal, and this screen turns it into a usable account.
 */
@Component({
  selector: 'app-accept-invitation',
  templateUrl: './accept-invitation.page.html',
  styleUrls: ['./accept-invitation.page.scss'],
  standalone: false,
})
export class AcceptInvitationPage {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(UserAuthService);

  readonly minLength = MIN_INVITATION_PASSWORD_LENGTH;

  /** Token from the invitation link, editable so it can be pasted. See the reset screen. */
  readonly form = this.fb.nonNullable.group(
    {
      token: [this.route.snapshot.queryParamMap.get('token') ?? '', [Validators.required]],
      password: ['', [Validators.required, Validators.minLength(MIN_INVITATION_PASSWORD_LENGTH)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordsMatch('password', 'confirmPassword') },
  );

  showPassword = false;
  isLoading = false;
  acceptedEmail = '';
  errorMessage = '';

  get hasMismatch(): boolean {
    return this.form.hasError('passwordMismatch') && (this.form.get('confirmPassword')?.touched ?? false);
  }

  async accept(): Promise<void> {
    if (this.form.invalid || this.isLoading) return;

    this.errorMessage = '';
    this.isLoading = true;

    const { token, password } = this.form.getRawValue();

    try {
      const accepted = await this.auth.acceptInvitation(token.trim(), password);

      // No session: the account now exists and can sign in, which is a separate
      // step and also a check that the password was typed as intended.
      this.acceptedEmail = accepted.email;
    } catch (error) {
      // Unknown, expired, already-accepted and disabled-user tokens are refused
      // through one path with one message — "already used" would confirm the
      // token was real.
      this.errorMessage = describePortalError(
        error,
        'That invitation is no longer valid. Ask your administrator for a new one.',
      );
    } finally {
      this.isLoading = false;
    }
  }
}
