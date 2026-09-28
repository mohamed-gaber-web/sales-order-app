import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { VanAction } from './van-sales.models';
import { VanRoleService } from './van-role.service';
import { VanStoreService } from './van-store.service';

/**
 * Loads Van Sales master data before any van screen opens. Offline with a cold
 * cache the load fails and the screen still opens — it shows what it can and
 * the route header offers Refresh — rather than trapping the rep on a spinner.
 */
export const vanDataGuard: CanActivateFn = async () => {
  await inject(VanStoreService).ensureLoaded();
  return true;
};

/** Keeps a role out of screens it has no business on (spec §3). */
export function vanRoleGuard(...actions: VanAction[]): CanActivateFn {
  return () => {
    const role = inject(VanRoleService);
    if (actions.some((a) => role.can(a))) return true;
    return inject(Router).createUrlTree(['/inventory/van-sales']);
  };
}
