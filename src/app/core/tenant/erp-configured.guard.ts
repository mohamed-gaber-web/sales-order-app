import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { TenantConfigStore } from './tenant-config.store';

/** Where a signed-in user goes when their workspace cannot reach Dynamics. */
export const SETUP_REQUIRED_ROUTE = '/setup-required';

/**
 * Keeps signed-in users out of screens that cannot possibly load.
 *
 * Every feature screen reads from Dynamics through the portal's ERP proxy. When
 * the tenant has no environment, no credential, or a credential that is being
 * rejected, those requests come back 404 or 502 — and what the user sees is a
 * dashboard of zeroes and lists that are mysteriously empty, with nothing on
 * screen explaining why or who can fix it.
 *
 * This sends them to one page that says what is missing instead.
 *
 * Runs *after* `authGuard`, and only acts on a settled answer: before the first
 * load the store reports no blocker, so a user is never bounced on the strength
 * of something the app has not yet asked.
 */
export const erpConfiguredGuard: CanActivateFn = (): boolean | UrlTree => {
  const config = inject(TenantConfigStore);
  const router = inject(Router);

  // Unknown is not the same as broken. `blocker()` stays null until loaded.
  if (!config.loaded() || config.blocker() === null) return true;

  return router.createUrlTree([SETUP_REQUIRED_ROUTE]);
};

/**
 * The mirror of the guard above: keeps the setup screen out of reach once the
 * workspace works, so a stale link or a back button cannot strand somebody on
 * a page telling them about a problem that is fixed.
 */
export const setupRequiredGuard: CanActivateFn = (): boolean | UrlTree => {
  const config = inject(TenantConfigStore);
  const router = inject(Router);

  return config.loaded() && config.blocker() === null
    ? router.createUrlTree(['/dashboard'])
    : true;
};
