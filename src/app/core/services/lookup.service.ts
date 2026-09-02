import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom, forkJoin, map, Observable, tap } from 'rxjs';
import { ApiService } from './api.service';
import { Company, Currency, Customer, ODataResponse } from '../models/lookup.models';

@Injectable({ providedIn: 'root' })
export class LookupService {
  private readonly destroyRef = inject(DestroyRef);

  // ── Signals ────────────────────────────────────────────
  readonly companies = signal<Company[]>([]);
  readonly currencies = signal<Currency[]>([]);
  readonly customers = signal<Customer[]>([]);

  constructor(private api: ApiService) {}

  /**
   * Loads every lookup at once.
   *
   * Called at launch for an already-signed-in user, and again straight after a
   * sign-in — which is the point these become fetchable, since they are D365
   * reads that a signed-out user has no screen for.
   */
  async loadAll(): Promise<void> {
    await firstValueFrom(
      forkJoin([this.loadCompanies(), this.loadCurrencies(), this.loadCustomers()]),
    );
  }

  // ── Companies ───────────────────────────────────────────
  loadCompanies(): Observable<void> {
    return this.api
      .get<ODataResponse<Company>>('/data/Companies', {
        'cross-company': 'true',
        '$count': 'true',
        '$orderby': 'DataArea asc',
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap(res => this.companies.set(res.value)),
        map(() => void 0)
      );
  }

  // ── Currencies ──────────────────────────────────────────
  loadCurrencies(): Observable<void> {
    return this.api
      .get<ODataResponse<Currency>>('/data/Currencies', {
        '$count': 'true',
        '$orderby': 'CurrencyCode asc',
        '$select': 'CurrencyCode,Name,Symbol',
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap(res => this.currencies.set(res.value)),
        map(() => void 0)
      );
  }

  // ── Customers ───────────────────────────────────────────
  loadCustomers(): Observable<void> {
    return this.api
      .get<ODataResponse<Customer>>('/data/CustomersV3', {
        '$count': 'true',
        '$orderby': 'CustomerAccount asc',
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        tap(res => this.customers.set(res.value)),
        map(() => void 0)
      );
  }
}
