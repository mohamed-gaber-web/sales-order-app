import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { LookupService, UserAuthService, describePortalError } from '../../../core';

@Component({
  selector: 'app-mfa',
  templateUrl: './mfa.page.html',
  styleUrls: ['./mfa.page.scss'],
  standalone: false,
})
export class MfaPage {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly auth = inject(UserAuthService);
  private readonly lookup = inject(LookupService);

  /**
   * One field, taking either a six-digit code or a recovery code.
   *
   * No length or pattern rule: recovery codes are longer and hyphenated, and a
   * client-side check that rejected one would lock out the person who has lost
   * their phone — exactly the case recovery codes exist for.
   */
  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required]],
  });

  isLoading = false;
  errorMessage = '';

  async verify(): Promise<void> {
    if (this.form.invalid || this.isLoading) return;

    this.errorMessage = '';
    this.isLoading = true;

    try {
      await this.auth.verifyMfa(this.form.getRawValue().code.trim());

      this.lookup.loadAll().catch(error => console.error('Lookup load failed:', error));
      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      // A wrong code, a code replayed inside its own window and a spent recovery
      // code all answer identically. One message, matching.
      this.errorMessage = describePortalError(error, 'That code was not accepted. Try again.');
    } finally {
      this.isLoading = false;
    }
  }
}
