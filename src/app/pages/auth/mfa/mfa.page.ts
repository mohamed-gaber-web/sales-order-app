import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { UserAuthService } from '../../../core/services/user-auth.service';
import { CompanyContextService } from '../../../core/config/company-context.service';
import { LookupService } from '../../../core/services/lookup.service';

/**
 * The second factor.
 *
 * Reached only from the login page, and only when the API answered
 * `mfa_required` — a branch that carries a challenge token and, deliberately, no
 * access token and no refresh token. A correct password alone must not reach
 * tenant data, which is the whole point of the factor, so nothing was persisted
 * before arriving here and there is no session to fall back to.
 *
 * The challenge token arrives in router state rather than a query parameter. A
 * URL is written to history and to server logs, and this value is exchangeable
 * for a real session for the next five minutes.
 */
@Component({
  selector: 'app-mfa',
  templateUrl: './mfa.page.html',
  styleUrls: ['./mfa.page.scss'],
  standalone: false,
})
export class MfaPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly auth = inject(UserAuthService);
  private readonly companies = inject(CompanyContextService);
  private readonly lookups = inject(LookupService);

  form: FormGroup;
  isLoading = false;
  errorMessage = '';
  /** Recovery codes are not six digits, so the input has to relax for them. */
  useRecoveryCode = false;

  private challengeToken = '';

  constructor() {
    this.form = this.fb.group({
      code: ['', [Validators.required]],
    });
  }

  ngOnInit(): void {
    const state = this.router.getCurrentNavigation()?.extras.state ?? history.state;
    this.challengeToken = (state as { challengeToken?: string })?.challengeToken ?? '';

    if (!this.challengeToken) {
      // Arrived here directly, or after a reload that lost the navigation state.
      // There is nothing to verify against, and inventing a friendlier path
      // would mean holding the challenge somewhere it should not be held.
      void this.router.navigateByUrl('/auth/login');
    }
  }

  toggleRecoveryCode(): void {
    this.useRecoveryCode = !this.useRecoveryCode;
    this.form.reset();
    this.errorMessage = '';
  }

  async verify(): Promise<void> {
    if (this.form.invalid || this.isLoading || !this.challengeToken) return;
    this.errorMessage = '';
    this.isLoading = true;

    const { code } = this.form.value as { code: string };

    try {
      await this.auth.verifyMfa(this.challengeToken, code.trim());

      try {
        await this.companies.load();
        await Promise.all([
          this.lookups.loadCurrencies().toPromise(),
          this.lookups.loadCustomers().toPromise(),
        ]);
      } catch {
        // Survivable; the screens that need these show their own empty states.
      }

      await this.router.navigateByUrl('/dashboard');
    } catch (error) {
      this.errorMessage = messageFor(error);
      this.form.reset();
    } finally {
      this.isLoading = false;
    }
  }

  async startOver(): Promise<void> {
    await this.router.navigateByUrl('/auth/login');
  }
}

function messageFor(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Cannot reach the server. Check your connection and try again.';
    }
    if (error.status === 429) {
      return 'Too many attempts. Wait a moment and try again.';
    }
    // A wrong code, a replayed code and a spent recovery code all answer
    // identically on the API. Repeating its message keeps them identical here.
    const body = error.error as { message?: string } | null;
    if (body?.message) return body.message;
  }
  return 'That code is not valid.';
}
