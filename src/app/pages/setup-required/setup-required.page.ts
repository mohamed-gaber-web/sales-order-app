import { Component, computed, inject } from '@angular/core';
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

  /**
   * The three records a workspace needs, and how far along it is.
   *
   * Derived from the same blocker the guard uses rather than tracked
   * separately, so the picture on screen cannot drift from the reason the user
   * was sent here. The blocker is ordered — an environment must exist before it
   * can carry a credential, and a credential must work before a company is
   * worth having — so it maps onto a sequence directly.
   *
   * A rep cannot perform any of these. That is the point of showing them: it
   * turns "something is wrong" into "we are on step two of three", which is a
   * thing you can relay to an administrator over the phone.
   */
  readonly steps = computed(() => {
    const blocker = this.config.blocker();

    // Index of the step currently being waited on. Past the end means done.
    const active =
      blocker === 'no_environment' ? 0
      : blocker === 'not_configured' || blocker === 'failing' ? 1
      : blocker === 'no_company' ? 2
      : 3;

    return ([
      { key: 'environment', icon: 'server-outline' },
      { key: 'credentials', icon: 'key-outline' },
      { key: 'company', icon: 'business-outline' },
    ] as const).map((step, index) => ({
      ...step,
      titleKey: 'auth.setupRequired.step.' + step.key + '.title',
      bodyKey: 'auth.setupRequired.step.' + step.key + '.body',
      done: index < active,
      active: index === active,
    }));
  });
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
