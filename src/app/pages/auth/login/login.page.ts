import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { UserAuthService } from '../../../core/services/user-auth.service';
import { CompanyContextService } from '../../../core/config/company-context.service';
import { LookupService } from '../../../core/services/lookup.service';
import { RuntimeConfigService } from '../../../core/config/runtime-config.service';
import { AlertController } from '@ionic/angular';

/**
 * Signing in.
 *
 * This page used to be a mock: it waited 1.4 seconds, accepted any password of
 * four characters or more, wrote the address to `localStorage` and navigated to
 * the dashboard. It now talks to the admin API, which has had real password
 * authentication, refresh-token rotation and TOTP since US-021.
 *
 * The "Sign in with Microsoft" button is gone rather than wired up. It was a
 * `setTimeout` that signed in a hardcoded address, and making it real would mean
 * MSAL, an Android URL scheme, an `assetlinks.json` and a public Entra client per
 * tenant — for a second way to do what the form above it already does. The
 * server models this: `tenant_mobile_config.userAuth` is nullable precisely so a
 * tenant can have no Entra sign-in at all.
 */
@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(UserAuthService);
  private readonly companies = inject(CompanyContextService);
  private readonly lookups = inject(LookupService);
  private readonly config = inject(RuntimeConfigService);
  private readonly alerts = inject(AlertController);

  form: FormGroup;
  showPassword = false;
  isLoading = false;
  errorMessage = '';

  constructor() {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      // No minimum length. The server decides what a valid password is, and a
      // client-side floor here only ever rejects a correct password that
      // predates the rule.
      password: ['', [Validators.required]],
    });
  }

  /**
   * The workspace this device last signed in to, if any.
   *
   * Was the literal string `USMF` — one customer's demo company, on the sign-in
   * screen of a build meant to serve every customer. Empty before a first
   * sign-in, because at that point the app genuinely does not know.
   */
  get workspaceName(): string {
    return this.config.tenantName();
  }

  async ngOnInit(): Promise<void> {
    const remembered = await this.auth.lastEmail();
    if (remembered) this.form.patchValue({ email: remembered });
  }

  async signIn(): Promise<void> {
    if (this.form.invalid || this.isLoading) return;
    this.errorMessage = '';
    this.isLoading = true;

    const { email, password } = this.form.value as { email: string; password: string };

    try {
      const outcome = await this.auth.signIn(email, password);

      if (outcome.status === 'mfa_required') {
        // The challenge token travels in router state, never in a query
        // parameter: a URL lands in history and in server logs, and this one is
        // exchangeable for a session for the next five minutes.
        await this.router.navigate(['/auth/mfa'], {
          state: { challengeToken: outcome.challenge.challengeToken },
        });
        return;
      }

      await this.afterSignIn();
    } catch (error) {
      this.errorMessage = messageFor(error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Asks for a reset link.
   *
   * Reports the same thing whatever happened, because the API does: it answers
   * an identical 202 whether or not the account exists, and a screen that said
   * "no such account" would undo that in one line.
   */
  async forgotPassword(): Promise<void> {
    const email = (this.form.value as { email: string }).email?.trim();
    if (!email) {
      this.errorMessage = 'Enter your email address first.';
      return;
    }

    try {
      await this.auth.requestPasswordReset(email);
    } catch {
      // Deliberately swallowed. Reporting a failure here would distinguish
      // addresses the server accepted from ones it did not.
    }

    const alert = await this.alerts.create({
      header: 'Check your email',
      message: `If ${email} has an account, a reset link is on its way.`,
      buttons: ['OK'],
    });
    await alert.present();
  }

  /**
   * Loads what the app needs, then goes where the user was headed.
   *
   * These three lookups used to run at launch, before anybody had signed in.
   * Here is where they can actually succeed — and a failure is survivable, so it
   * does not block the navigation.
   */
  private async afterSignIn(): Promise<void> {
    try {
      await this.companies.load();
      await Promise.all([
        this.lookups.loadCurrencies().toPromise(),
        this.lookups.loadCustomers().toPromise(),
      ]);
    } catch {
      // A tenant whose ERP connection is not configured yet still gets an app;
      // the screens that need these show their own empty states.
    }

    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    await this.router.navigateByUrl(returnUrl || '/dashboard');
  }
}

/**
 * What to show the user.
 *
 * The API's own message is preferred where there is one: it is written for this
 * purpose and is deliberately identical for a wrong address and a wrong password,
 * so repeating it does not reintroduce the enumeration difference it avoids.
 */
function messageFor(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'Cannot reach the server. Check your connection and try again.';
    }
    if (error.status === 429) {
      return 'Too many attempts. Wait a moment and try again.';
    }
    const body = error.error as { message?: string } | null;
    if (body?.message) return body.message;
  }
  return 'Something went wrong signing in. Try again.';
}
