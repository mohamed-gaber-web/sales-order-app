import { Injectable, inject } from '@angular/core';
import { PortalApiService } from '../auth';
import { TenantConfigStore } from './tenant-config.store';
import { PortalMe, TenantCompany, TenantConnection, TenantModule } from './tenant-config.models';

/**
 * Loads the signed-in tenant's configuration from the admin portal.
 *
 * Three reads, in parallel, all tenant-scoped by the access token — there is no
 * tenant id in any of these paths, so one user cannot ask about another's
 * workspace:
 *
 * - `/connections` — the Dynamics environments and whether their credentials work
 * - `/companies`   — the legal entities, which carry `dataAreaId`
 * - `/modules`     — what this tenant is entitled to
 *
 * None of them can return a secret: the portal's connection schema has no field
 * for one, so any authenticated user may read this safely.
 */
@Injectable({ providedIn: 'root' })
export class TenantConfigService {
  private readonly api = inject(PortalApiService);
  private readonly store = inject(TenantConfigStore);

  /**
   * Fetches everything and settles the store.
   *
   * Never throws. A failure still marks the store loaded — with nothing — so the
   * app shows the setup screen with a reason rather than hanging on a spinner
   * or, worse, letting the user into screens whose every request will fail.
   */
  async load(): Promise<void> {
    try {
      const [connections, companies, modules] = await Promise.all([
        this.api.get<TenantConnection[]>('/connections'),
        this.api.get<TenantCompany[]>('/companies'),
        this.api.get<TenantModule[]>('/modules'),
      ]);

      this.store.set({
        connections: asArray(connections),
        companies: asArray(companies),
        modules: asArray(modules),
      });
    } catch (error) {
      console.error('Could not load tenant configuration:', error);
      this.store.markLoaded();
    }

    await this.loadMe();
  }

  /**
   * The signed-in user's own details — today, their default warehouse.
   *
   * Separate from the load above on purpose: an API from before `/me` existed
   * answers 404, and that must cost the user their preselected warehouse, not
   * the whole tenant configuration.
   */
  private async loadMe(): Promise<void> {
    try {
      const me = await this.api.get<PortalMe>('/me');
      this.store.setDefaultWarehouse(me?.defaultWarehouse ?? null);
    } catch {
      this.store.setDefaultWarehouse(null);
    }
  }
}

/** Guards against a response that is not the array the contract promises. */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}
