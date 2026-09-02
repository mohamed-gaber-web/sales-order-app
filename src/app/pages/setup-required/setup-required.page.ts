import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TenantConfigService, TenantConfigStore, UserAuthService } from '../../core';

/**
 * Shown when the signed-in workspace cannot reach Dynamics.
 *
 * Deliberately not an error toast on top of a broken dashboard. A rep looking at
 * empty lists cannot tell "no orders today" from "nobody finished setting this
 * up", and neither can guess who fixes it — so this names the problem, says who
 * can resolve it, and offers to re-check.
 */
@Component({
  selector: 'app-setup-required',
  templateUrl: './setup-required.page.html',
  styleUrls: ['./setup-required.page.scss'],
  standalone: false,
})
export class SetupRequiredPage {
  private readonly config = inject(TenantConfigStore);
  private readonly tenantConfig = inject(TenantConfigService);
  private readonly auth = inject(UserAuthService);
  private readonly router = inject(Router);

  readonly message = this.config.blockerMessage;
  readonly connections = this.config.connections;
  readonly workspace = inject(TenantConfigStore);

  isChecking = false;

  /**
   * Re-reads the configuration.
   *
   * The administrator is often fixing this while the rep waits, so a check that
   * needs the app restarted would be the wrong shape. On success the guard on
   * `/dashboard` lets them straight through.
   */
  async recheck(): Promise<void> {
    if (this.isChecking) return;
    this.isChecking = true;

    try {
      await this.tenantConfig.load();
      if (this.config.blocker() === null) {
        await this.router.navigateByUrl('/dashboard');
      }
    } finally {
      this.isChecking = false;
    }
  }

  signOut(): void {
    void this.auth.signOut();
  }
}
