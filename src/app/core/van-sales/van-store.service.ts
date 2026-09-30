import { computed, inject, Injectable, signal } from '@angular/core';
import { catchError, firstValueFrom, forkJoin, map, Observable, of, switchMap, throwError } from 'rxjs';
import { round2 } from './pricing-engine';
import { VanSalesApiRouter } from './van-sales-api.router';
import { customerBalance } from './van-rules';
import {
  Customer,
  MasterData,
  Product,
  SalesOrder,
  SurveyDefinition,
  VanStockLine,
} from './van-sales.models';
import { localIsoDate } from './van-uuid';
import { VanOutboxService } from './van-outbox.service';

const MASTER_KEY = 'gp.vanSales.master';
const LOCAL_KEY = 'gp.vanSales.local';

/** Used until the price-group factor setup is exposed as an entity. */
const DEFAULT_GROUP_FACTORS: Record<string, number> = { Retail: 1, Wholesale: 0.95, 'Key account': 0.92 };

/** What belongs to this device's working day, beyond the master data. */
export interface VanLocalDay {
  date: string;
  /** Returned stock that cannot be resold — unloaded to quarantine at day close. */
  damaged: VanStockLine[];
  /** Customers already surveyed today. */
  surveyed: string[];
  /** Customers checked in through a geofence override today. */
  geofenceOverrides: string[];
  /** Load requests raised today (#31), for the van-stock screen. */
  loadRequests: { id: string; at: string; lines: VanStockLine[] }[];
  /** Transfers already received today (#32). */
  receivedTransfers: string[];
  dayClosed: boolean;
  closedAt?: string;
  /** Cash counted into the box at close. */
  cashCounted?: number;
}

function emptyDay(): VanLocalDay {
  return {
    date: localIsoDate(),
    damaged: [],
    surveyed: [],
    geofenceOverrides: [],
    loadRequests: [],
    receivedTransfers: [],
    dayClosed: false,
  };
}

/**
 * The device's copy of Van Sales master data (spec §5) and of everything the
 * day has changed in it — balances, stock, points, orders.
 *
 * Pulled on sign-in and on Refresh, cached for offline use. Local changes are
 * optimistic (spec §9): a posted invoice reduces van stock *now*, not when
 * D365 acknowledges it, and the next pull reconciles. A pull while the outbox
 * still holds unsent work keeps the day's local balances and stock — replacing
 * them with D365's view would silently undo documents D365 has not seen yet.
 */
@Injectable({ providedIn: 'root' })
export class VanStoreService {
  private readonly api = inject(VanSalesApiRouter);
  private readonly outbox = inject(VanOutboxService);

  private readonly _master = signal<MasterData | null>(this.restore<MasterData>(MASTER_KEY));
  private readonly _local = signal<VanLocalDay>(this.restoreLocal());
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly master = this._master.asReadonly();
  readonly local = this._local.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly isLoaded = computed(() => this._master() !== null);
  readonly repSetup = computed(() => this._master()?.repSetup ?? null);
  readonly customers = computed(() => this._master()?.customers ?? []);
  readonly products = computed(() => this._master()?.products ?? []);
  readonly vanStock = computed(() => this._master()?.vanStock ?? []);
  readonly orders = computed(() => this._master()?.orders ?? []);
  readonly reasons = computed(() => this._master()?.reasons ?? []);
  readonly surveys = computed(() => this._master()?.surveys ?? []);
  readonly banks = computed(() => this._master()?.banks ?? []);
  readonly promotions = computed(() => this._master()?.promotions ?? []);
  readonly currency = computed(() => this._master()?.repSetup.currency ?? '');
  readonly dayClosed = computed(() => this._local().dayClosed);

  // ── Loading ──────────────────────────────────────────────────────────────

  /** Pulls once if nothing is cached; otherwise resolves with the cache. */
  async ensureLoaded(): Promise<MasterData | null> {
    this.rollDayIfNeeded();
    if (this._master()) return this._master();
    return this.refresh();
  }

  /**
   * Pulls every master-data entity. A piece that fails keeps its cached value,
   * so a flaky connection degrades to yesterday's promotions rather than none.
   */
  async refresh(): Promise<MasterData | null> {
    this._loading.set(true);
    this._error.set(null);
    const cached = this._master();
    try {
      const pulled = await firstValueFrom(this.pull(cached));
      const keepLocal = cached && !this.outbox.isEmpty();
      const next: MasterData = keepLocal
        ? { ...pulled, customers: cached.customers, vanStock: cached.vanStock, orders: cached.orders }
        : pulled;
      this.setMaster(next);
      return next;
    } catch (e) {
      this._error.set(e instanceof Error ? e.message : 'Could not load van sales data.');
      return cached;
    } finally {
      this._loading.set(false);
    }
  }

  private pull(cached: MasterData | null): Observable<MasterData> {
    const keep = <T>(value: T | undefined, fallback: T) => (source: Observable<T>) =>
      source.pipe(catchError(() => of(value ?? fallback)));

    return this.api.getRepSetup().pipe(
      catchError((err: unknown) => (cached ? of(cached.repSetup) : throwError(() => err))),
      switchMap((rep) =>
        forkJoin({
          customers: this.api.getCustomers(rep.routeId).pipe(keep(cached?.customers, [] as Customer[])),
          journey: this.api.getJourney(rep.routeId).pipe(keep(cached?.journey, [])),
          products: this.api.getProducts().pipe(keep(cached?.products, [] as Product[])),
          prices: this.api.getPrices().pipe(keep(cached?.prices, [])),
          taxGroups: this.api.getTaxGroups().pipe(keep(cached?.taxGroups, [])),
          reasons: this.api.getReturnReasons().pipe(keep(cached?.reasons, [])),
          promotions: this.api.getPromotions().pipe(keep(cached?.promotions, [])),
          surveys: this.api.getSurveys().pipe(keep(cached?.surveys, [])),
          loyalty: this.api
            .getLoyaltyRules()
            .pipe(keep(cached?.loyalty, { earnPerUnit: 0, redeemValuePerPoint: 0, minRedeemPoints: 0, tiers: [] })),
          banks: this.api.getBanks().pipe(keep(cached?.banks, [] as string[])),
          vanStock: this.api.getVanStock(rep.vanWarehouse).pipe(keep(cached?.vanStock, [] as VanStockLine[])),
          orders: this.api.getOrders(rep.routeId).pipe(keep(cached?.orders, [] as SalesOrder[])),
          lastPrices: this.api.getLastPrices(rep.routeId).pipe(keep(cached?.lastPrices, [])),
        }).pipe(
          map(
            (parts): MasterData => ({
              repSetup: rep,
              ...parts,
              priceGroupFactors: cached?.priceGroupFactors ?? DEFAULT_GROUP_FACTORS,
              pulledAt: new Date().toISOString(),
            })
          )
        )
      )
    );
  }

  // ── Lookups ──────────────────────────────────────────────────────────────

  customer(id: string): Customer | undefined {
    return this.customers().find((c) => c.id === id);
  }

  product(itemId: string): Product | undefined {
    return this.products().find((p) => p.itemId === itemId);
  }

  productName(itemId: string): string {
    return this.product(itemId)?.name ?? itemId;
  }

  stockOf(itemId: string): number {
    return this.vanStock().find((s) => s.itemId === itemId)?.qty ?? 0;
  }

  balanceOf(id: string): number {
    const c = this.customer(id);
    return c ? customerBalance(c) : 0;
  }

  vatPctOf(itemId: string): number {
    const p = this.product(itemId);
    return this._master()?.taxGroups.find((t) => t.code === p?.taxGroup)?.ratePct ?? 0;
  }

  // ── Survey definitions (builder) ─────────────────────────────────────────

  /**
   * Saves a survey to the backend, then into the cached master data so the
   * field screen offers it at once. Online only: a definition half-sent to
   * some vans and not others would mean two versions of the same survey.
   */
  async saveSurvey(def: SurveyDefinition): Promise<SurveyDefinition> {
    const saved = await firstValueFrom(this.api.saveSurvey(def));
    this.mutate((m) => {
      const exists = m.surveys.some((s) => s.id === saved.id);
      return { ...m, surveys: exists ? m.surveys.map((s) => (s.id === saved.id ? saved : s)) : [...m.surveys, saved] };
    });
    return saved;
  }

  /** Pulls just the survey definitions — cheaper than a full refresh. */
  async reloadSurveys(): Promise<void> {
    const surveys = await firstValueFrom(this.api.getSurveys());
    this.mutate((m) => ({ ...m, surveys }));
  }

  async deleteSurvey(id: string): Promise<void> {
    await firstValueFrom(this.api.deleteSurvey(id));
    this.mutate((m) => ({ ...m, surveys: m.surveys.filter((s) => s.id !== id) }));
  }

  // ── Optimistic mutations ─────────────────────────────────────────────────

  patchCustomer(id: string, fn: (c: Customer) => Customer): void {
    this.mutate((m) => ({ ...m, customers: m.customers.map((c) => (c.id === id ? fn(c) : c)) }));
  }

  /** Adds (positive) or removes (negative) van stock. Never goes below zero. */
  adjustStock(itemId: string, delta: number): void {
    if (!delta) return;
    this.mutate((m) => {
      const exists = m.vanStock.some((s) => s.itemId === itemId);
      const vanStock = exists
        ? m.vanStock.map((s) => (s.itemId === itemId ? { ...s, qty: Math.max(0, round2(s.qty + delta)) } : s))
        : delta > 0
          ? [...m.vanStock, { itemId, qty: delta }]
          : m.vanStock;
      return { ...m, vanStock };
    });
  }

  upsertOrder(order: SalesOrder): void {
    this.mutate((m) => {
      const exists = m.orders.some((o) => o.salesId === order.salesId);
      return { ...m, orders: exists ? m.orders.map((o) => (o.salesId === order.salesId ? order : o)) : [...m.orders, order] };
    });
  }

  addDamaged(itemId: string, qty: number): void {
    if (qty <= 0) return;
    this.mutateLocal((d) => {
      const exists = d.damaged.some((s) => s.itemId === itemId);
      return {
        ...d,
        damaged: exists
          ? d.damaged.map((s) => (s.itemId === itemId ? { ...s, qty: s.qty + qty } : s))
          : [...d.damaged, { itemId, qty }],
      };
    });
  }

  mutateLocal(fn: (d: VanLocalDay) => VanLocalDay): void {
    const next = fn(this._local());
    this._local.set(next);
    this.save(LOCAL_KEY, next);
  }

  /** Starts a fresh local day. Master data is kept; the next pull refreshes it. */
  startNewDay(): void {
    this.mutateLocal(() => emptyDay());
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private rollDayIfNeeded(): void {
    if (this._local().date !== localIsoDate() && this._local().dayClosed) this.startNewDay();
  }

  private mutate(fn: (m: MasterData) => MasterData): void {
    const m = this._master();
    if (!m) return;
    this.setMaster(fn(m));
  }

  private setMaster(m: MasterData): void {
    this._master.set(m);
    this.save(MASTER_KEY, m);
  }

  private save(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Quota — the day still works for this session.
    }
  }

  private restore<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  private restoreLocal(): VanLocalDay {
    const d = this.restore<VanLocalDay>(LOCAL_KEY);
    return d && Array.isArray(d.damaged) ? { ...emptyDay(), ...d } : emptyDay();
  }
}
