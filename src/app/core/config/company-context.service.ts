import { inject, Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_ROUTES, type TenantCompany } from '../api/api-contracts';
import { RuntimeConfigService } from './runtime-config.service';
import { DeviceStorageService, STORAGE_KEYS } from '../storage/device-storage.service';

/**
 * Which legal entity the user is working in.
 *
 * Two jobs, and they were previously done by the same hardcoded string. Every
 * OData query in this app filters on `dataAreaId`, and it is written `'usmf'` in
 * fifty-three files — a literal that happens to be one customer's demo company.
 * This is where that value should come from instead.
 *
 * The second job is newer: a company also names an **environment**, because
 * `company.environment_id` is a real column with a composite foreign key behind
 * it. The API needs that to know which of a tenant's D365 instances a proxied
 * request means, so selecting a company here is what makes prod-versus-UAT a
 * choice rather than a guess.
 *
 * The list comes from the admin API rather than from D365. It used to be an
 * unfiltered cross-company OData sweep at launch, before anybody had signed in;
 * `GET /companies` returns the same thing scoped to the caller's tenant, and
 * returns `environmentId` alongside it, which the OData version never could.
 */
@Injectable({ providedIn: 'root' })
export class CompanyContextService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(RuntimeConfigService);
  private readonly storage = inject(DeviceStorageService);

  private readonly companiesState = signal<TenantCompany[]>([]);
  private readonly selectedIdState = signal<string | null>(null);

  readonly companies = this.companiesState.asReadonly();
  readonly selected = computed(
    () => this.companiesState().find((c) => c.id === this.selectedIdState()) ?? null
  );

  /** The selected company's id, for the proxy header. Null selects nothing. */
  selectedCompanyId(): string | null {
    return this.selectedIdState();
  }

  /**
   * The `dataAreaId` queries should filter on.
   *
   * Falls back to `usmf` because that is what fifty-three files currently
   * hardcode — so until a company is chosen, behaviour is exactly what it was.
   * Removing the fallback is the last step of the multi-company work, not the
   * first, and doing it here would break every screen at once.
   */
  dataAreaId(): string {
    return this.selected()?.dataAreaId ?? 'usmf';
  }

  /** Restores the last selection. No network. */
  async restore(): Promise<void> {
    const stored = await this.storage.get(STORAGE_KEYS.selectedCompany);
    if (stored) this.selectedIdState.set(stored);
  }

  /**
   * Loads the tenant's companies. Requires a session.
   *
   * Called after sign-in rather than at launch — it is tenant-scoped, so before
   * a sign-in there is nothing it could return.
   */
  async load(): Promise<void> {
    const companies = await firstValueFrom(
      this.http.get<TenantCompany[]>(`${this.config.apiBaseUrl}${API_ROUTES.companies}`)
    );
    this.companiesState.set(companies);

    const selected = this.selectedIdState();
    // A stored selection from another tenant, or a company since removed, would
    // otherwise send a header the API answers 404 to — on every request, with no
    // obvious cause. Falling back to the only company is right far more often
    // than leaving a stale id in place.
    if (!selected || !companies.some((c) => c.id === selected)) {
      await this.select(companies.length === 1 ? companies[0].id : null);
    }
  }

  async select(companyId: string | null): Promise<void> {
    this.selectedIdState.set(companyId);
    if (companyId) {
      await this.storage.set(STORAGE_KEYS.selectedCompany, companyId);
    } else {
      await this.storage.remove(STORAGE_KEYS.selectedCompany);
    }
  }

  async clear(): Promise<void> {
    this.companiesState.set([]);
    await this.select(null);
  }
}
