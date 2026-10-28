import { Injectable, computed, signal } from '@angular/core';
import {
  ERP_BLOCKER_MESSAGES,
  TenantCompany,
  TenantConnection,
  TenantModule,
  findErpBlocker,
  UserDefaultWarehouse,
} from './tenant-config.models';

/**
 * What this tenant is configured with, as signals the app reads.
 *
 * Replaces the `auth` and `d365BaseUrl` blocks that used to sit in
 * `environment.ts`: which Dynamics environment, which legal entities, which
 * modules. All of it now arrives per tenant, from the admin portal, after
 * sign-in — so one build serves every customer and changing a customer's ERP is
 * a portal edit rather than a release.
 *
 * `loaded` is deliberately separate from "has data". Until the first fetch
 * settles, the app knows nothing — and a guard that treated *unknown* as *not
 * configured* would bounce every user to the setup screen for a moment on every
 * launch.
 */
@Injectable({ providedIn: 'root' })
export class TenantConfigStore {
  private readonly connectionsState = signal<TenantConnection[]>([]);
  private readonly companiesState = signal<TenantCompany[]>([]);
  private readonly modulesState = signal<TenantModule[]>([]);
  private readonly loadedState = signal(false);
  private readonly defaultWarehouseState = signal<UserDefaultWarehouse | null>(null);

  readonly connections = this.connectionsState.asReadonly();
  readonly companies = this.companiesState.asReadonly();
  readonly modules = this.modulesState.asReadonly();

  /** True once a fetch has settled — successfully or not. */
  readonly loaded = this.loadedState.asReadonly();

  /**
   * What stops this tenant reaching Dynamics, or null when nothing does.
   *
   * Null before the first load too: unknown is not the same as broken.
   */
  readonly blocker = computed(() =>
    this.loadedState() ? findErpBlocker(this.connectionsState(), this.companiesState()) : null
  );

  /** True when ERP calls can be expected to work. */
  readonly erpReady = computed(() => this.loadedState() && this.blocker() === null);

  /** The message pair to show when the ERP is unusable. */
  readonly blockerMessage = computed(() => {
    const blocker = this.blocker();
    return blocker ? ERP_BLOCKER_MESSAGES[blocker] : null;
  });

  /** The connected environment, when there is one. */
  readonly environment = computed(
    () => this.connectionsState().find(connection => connection.state === 'connected') ?? null
  );

  /**
   * The company every OData query scopes to.
   *
   * The app used to hard-code `'usmf'`. This is the same value, read from the
   * tenant's own configuration — so a customer on a different legal entity works
   * without a rebuild. Falls back to the first company when the environment is
   * still unknown.
   */
  readonly dataAreaId = computed(() => {
    const environment = this.environment();
    const companies = this.companiesState();
    const match = environment
      ? companies.find(company => company.environmentId === environment.environmentId)
      : undefined;
    return (match ?? companies[0])?.dataAreaId ?? null;
  });

  /**
   * `dataAreaId` for building a request, read at call time.
   *
   * Empty rather than a guessed company when none is known yet: a request for
   * no company fails visibly, while the old `'usmf'` fallback quietly read
   * another legal entity — which, for every tenant that is not USMF, is wrong.
   */
  currentDataAreaId(): string {
    return this.dataAreaId() ?? '';
  }

  /**
   * The company id for the `x-d365-company` header.
   *
   * Only needed once a tenant has more than one environment; with one, the API
   * resolves it and the header is omitted.
   */
  readonly companyId = computed(() => {
    if (this.connectionsState().length < 2) return null;
    const environment = this.environment();
    return environment
      ? this.companiesState().find(c => c.environmentId === environment.environmentId)?.id ?? null
      : null;
  });

  /** The signed-in user's warehouse, as assigned in the portal. */
  readonly defaultWarehouse = this.defaultWarehouseState.asReadonly();

  /**
   * The user's warehouse id, but only in the company the app is working in.
   *
   * Warehouse ids repeat across D365 legal entities — `11` exists in many — so
   * a warehouse assigned in one company must not preselect a namesake in
   * another.
   */
  readonly defaultWarehouseId = computed(() => {
    const warehouse = this.defaultWarehouseState();
    const current = this.dataAreaId();
    return warehouse && current && warehouse.dataAreaId.toLowerCase() === current.toLowerCase()
      ? warehouse.warehouseId
      : null;
  });

  /**
   * The user's warehouse from a screen's own list, or undefined.
   *
   * Every screen calls this only when nothing is selected yet, so it fills an
   * empty field and never overrides a choice.
   */
  pickDefaultWarehouse<T extends { WarehouseId: string }>(list: readonly T[] | null | undefined): T | undefined {
    const id = this.defaultWarehouseId();
    return id ? list?.find(warehouse => warehouse.WarehouseId === id) : undefined;
  }

  setDefaultWarehouse(warehouse: UserDefaultWarehouse | null): void {
    this.defaultWarehouseState.set(warehouse);
  }

  /** True when the tenant is entitled to a module. Unknown modules are off. */
  hasModule(key: string): boolean {
    return this.modulesState().some(module => module.key === key && module.enabled);
  }

  set(input: {
    connections: TenantConnection[];
    companies: TenantCompany[];
    modules: TenantModule[];
  }): void {
    this.connectionsState.set(input.connections);
    this.companiesState.set(input.companies);
    this.modulesState.set(input.modules);
    this.loadedState.set(true);
  }

  /** Marks a load as having settled with nothing — a tenant configured with nothing. */
  markLoaded(): void {
    this.loadedState.set(true);
  }

  /** Back to knowing nothing. Called on sign-out, so the next user starts clean. */
  clear(): void {
    this.connectionsState.set([]);
    this.companiesState.set([]);
    this.modulesState.set([]);
    this.loadedState.set(false);
    this.defaultWarehouseState.set(null);
  }
}
