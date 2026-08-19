import { inject, Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree, type RouterStateSnapshot } from '@angular/router';
import { UserAuthService } from '../services/user-auth.service';
import { SESSION_READY } from '../auth/session-ready';

/**
 * Keeps signed-out users out.
 *
 * Two changes from the version this replaces, both of which were bugs rather
 * than improvements.
 *
 * **It waits.** Session state now lives in Capacitor Preferences, which is
 * asynchronous, so answering synchronously meant answering before storage had
 * been read — a cold start into a deep link would bounce a perfectly good
 * session to the login screen.
 *
 * **It is applied to the whole app.** It used to protect `dashboard` and nothing
 * else, so `sales-order`, `purchase-order`, `transfer-order` and the twenty-five
 * screens under `inventory` were reachable by deep link with no session at all.
 * That mattered less when every request carried an application credential the
 * app minted for itself; now those screens would simply fail, and failing at the
 * login screen is the better failure.
 */
@Injectable({ providedIn: 'root' })
export class AuthGuard implements CanActivate {
  private readonly auth = inject(UserAuthService);
  private readonly router = inject(Router);
  private readonly ready = inject(SESSION_READY);

  async canActivate(_route: unknown, state: RouterStateSnapshot): Promise<boolean | UrlTree> {
    await this.ready.whenReady;

    if (this.auth.isAuthenticated()) return true;

    // Carried so signing in returns the user where they were headed, rather than
    // to a dashboard they then have to navigate away from.
    return this.router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: state.url },
    });
  }
}
