import { Component, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LookupService,
  MobileConfigStore,
  TenantConfigService,
  UserAuthService,
  describePortalError,
  isAuthenticated,
} from '../../../core';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(UserAuthService);
  private readonly lookup = inject(LookupService);
  private readonly config = inject(MobileConfigStore);
  private readonly tenantConfig = inject(TenantConfigService);

  /**
   * The workspace this build bootstrapped into, known before anyone signs in.
   *
   * This is what `/mobile/config` exists to answer: the tenant's real name,
   * fetched at launch, rather than a constant compiled into the bundle. Empty
   * until a configuration is in force, and the template hides the chip then —
   * a blank where an organisation's name belongs reads as a broken shell.
   */
  readonly workspaceName = this.config.tenantName;

  /** True when this build is older than the floor the tenant will serve. */
  readonly updateRequired = this.config.updateRequired;

  /**
   * Password carries `required` and nothing else.
   *
   * A client-side length rule here can only mis-reject a valid existing
   * password — the server decides, and the minimum it enforces applies where a
   * password is *set*, not where one is presented.
   */
  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  showPassword = false;
  isLoading = false;
  errorMessage = '';

  async signIn(): Promise<void> {
    if (this.form.invalid || this.isLoading) return;

    this.errorMessage = '';
    this.isLoading = true;

    const { email, password } = this.form.getRawValue();

    try {
      const response = await this.auth.signIn(email.trim(), password);

      if (!isAuthenticated(response)) {
        await this.router.navigateByUrl('/auth/mfa');
        return;
      }

      // Awaited, because `erpConfiguredGuard` runs on the very next navigation
      // and needs a settled answer — otherwise a workspace with no ERP
      // connection lands on a dashboard of zeroes instead of an explanation.
      await this.tenantConfig.load();

      // The lookups are ERP reads a signed-out user has no screen for, so the
      // app initializer skips them. This is the moment they become fetchable.
      // A failure leaves empty lists, which the screens already handle — it must
      // not hold up a sign-in that succeeded.
      this.lookup.loadAll().catch(error => console.error('Lookup load failed:', error));

      await this.router.navigateByUrl(this.returnUrl());
    } catch (error) {
      // The API answers identically for a wrong password, an unknown address and
      // a disabled account, on purpose. Showing its message verbatim is what
      // keeps this screen from becoming an account-enumeration oracle.
      this.errorMessage = describePortalError(error, 'Could not sign you in. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  /** Where the guard wanted to go before it sent the user here. */
  private returnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    // Only same-app paths: an absolute URL here would be an open redirect.
    return returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/dashboard';
  }
}
