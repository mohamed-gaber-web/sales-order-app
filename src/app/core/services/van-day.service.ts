import { computed, Injectable, signal } from '@angular/core';
import {
  VanDay,
  VanOpenInvoice,
  VanVisit,
} from '../../models/van-journey.model';
import { VanSaleResult } from '../../models/van-sales.model';

const STORAGE_KEY = 'gp.vanSales.day';

/**
 * The driver's working day: the planned route, the stop currently being served,
 * running KPIs, open invoices and the outbox — the shared state every screen in
 * the van cycle reads and mutates.
 *
 * Like {@link VanCartService} this lives in signals (so pages run OnPush) and is
 * mirrored to localStorage: a driver mid-round can lose the app to a call or a
 * reload, and losing the day's progress — which stops are done, what's been
 * collected — is not acceptable.
 *
 * The store never talks to D365 itself. {@link VanJourneyService} seeds the day
 * and {@link VanFieldOpsService} posts documents; this only holds the result so
 * the UI stays consistent whether or not the network round-trip has landed.
 */
@Injectable({ providedIn: 'root' })
export class VanDayService {
  private readonly _day = signal<VanDay | null>(this.restore());
  private readonly _currentVisitId = signal<number | null>(null);

  readonly day = this._day.asReadonly();

  readonly isLoaded = computed(() => this._day() !== null);
  readonly visits = computed(() => this._day()?.visits ?? []);
  readonly kpi = computed(() => this._day()?.kpi);
  readonly outbox = computed(() => this._day()?.outbox);
  readonly openInvoices = computed(() => this._day()?.openInvoices ?? []);
  readonly isDayOpen = computed(() => this._day()?.open ?? false);

  /** The stop the driver is serving, resolved from the id set on navigation. */
  readonly currentVisit = computed<VanVisit | null>(() => {
    const id = this._currentVisitId();
    if (id === null) return null;
    return this._day()?.visits.find((v) => v.id === id) ?? null;
  });

  /**
   * The stop the driver most recently finished — where the van actually is,
   * on a round already under way.
   *
   * Falls back to the last done stop in planned order for a day stored before
   * the id was tracked: wrong if that day was resequenced, but it is the only
   * answer such a day can give, and it beats no answer.
   */
  readonly lastCompletedVisit = computed<VanVisit | null>(() => {
    const day = this._day();
    if (!day) return null;

    const stamped = day.visits.find((v) => v.id === day.lastCompletedVisitId);
    if (stamped) return stamped;

    for (let i = day.visits.length - 1; i >= 0; i--) {
      if (day.visits[i].status === 'done') return day.visits[i];
    }
    return null;
  });

  /** Visits finished, out of the day's plan — drives the header progress. */
  readonly doneCount = computed(
    () => this.visits().filter((v) => v.status === 'done').length
  );

  // ── Loading ──────────────────────────────────────────────────────────────

  /** Seeds the day from {@link VanJourneyService}. A day already in progress
   *  (restored from storage) is kept so a reload doesn't wipe the round. */
  loadIfEmpty(day: VanDay): void {
    if (this._day()) return;
    this.setDay(day);
  }

  /** Replaces the day outright — used by "start a new day" / pull-to-refresh. */
  reset(day: VanDay): void {
    this._currentVisitId.set(null);
    this.setDay(day);
  }

  setCurrentVisit(id: number): void {
    this._currentVisitId.set(id);
  }

  /**
   * True for a day restored from storage before stops carried coordinates.
   *
   * Such a day is kept, not thrown away. Discarding it would cost the driver
   * every finished stop, the day's sales and collections, the open invoices and
   * the outbox — including posts D365 has not yet acknowledged — which is
   * exactly the loss this store exists to prevent. What it is missing is
   * geography, and geography can be refilled.
   */
  readonly needsGeography = computed(() => {
    const day = this._day();
    if (!day) return false;
    return !day.depot || day.visits.some((v) => !v.geo);
  });

  /**
   * Fills a restored day's missing coordinates from a fresh plan.
   *
   * Matched on customer account, which is the stop's identity — the plan's
   * ordering and its ids may both have moved on since the day was stored. A
   * stop with no match keeps its progress and stays unpositioned; the route
   * screen leaves those out of the sequence rather than inventing a position
   * for them.
   *
   * Only geography is copied. Everything the driver has done — status,
   * outcomes, balances, KPIs, the outbox — is left exactly as stored.
   */
  applyGeography(seed: VanDay): void {
    if (!this.needsGeography()) return;

    const byAccount = new Map(seed.visits.map((v) => [v.account, v]));

    this.mutate((day) => ({
      ...day,
      depot: day.depot ?? seed.depot,
      visits: day.visits.map((visit) => {
        if (visit.geo) return visit;
        const match = byAccount.get(visit.account);
        if (!match) return visit;
        return { ...visit, geo: match.geo, address: visit.address || match.address };
      }),
    }));
  }

  // ── Visit lifecycle ──────────────────────────────────────────────────────

  /** Records a GPS check-in — the visit's actions unlock from here. */
  checkIn(id: number): void {
    this.patchVisit(id, () => ({ checkedIn: true, status: 'current' }));
  }

  /**
   * Applies a posted sale to the current visit: marks it done, adds the amount
   * to the day's sales, and books the invoice as an open receivable so a later
   * collection has something to settle against.
   */
  recordSale(result: VanSaleResult): void {
    const visit = this.currentVisit();
    if (!visit) return;

    const invoice: VanOpenInvoice = {
      invoiceId: result.orderNumber,
      date: 'Today',
      amount: result.totalAmount,
      open: visit.mode === 'credit' ? result.totalAmount : 0,
    };

    this.mutate((day) => ({
      ...day,
      visits: day.visits.map((v) =>
        v.id === visit.id
          ? {
              ...v,
              status: 'done',
              outcome: 'Sold',
              balance: v.mode === 'credit' ? v.balance + result.totalAmount : v.balance,
            }
          : v
      ),
      lastCompletedVisitId: visit.id,
      openInvoices: invoice.open > 0 ? [...day.openInvoices, invoice] : day.openInvoices,
      kpi: {
        ...day.kpi,
        visited: day.kpi.visited + (visit.status === 'done' ? 0 : 1),
        sales: day.kpi.sales + result.totalAmount,
      },
      outbox: {
        ...day.outbox,
        invoices: day.outbox.invoices + 1,
      },
    }));
  }

  /**
   * Settles a collection against the current visit's open invoices, oldest
   * first, and reduces the customer balance. Returns the per-invoice split so
   * the receipt can show what was applied where.
   */
  applyCollection(amount: number): { invoiceId: string; applied: number }[] {
    const visit = this.currentVisit();
    if (!visit || amount <= 0) return [];

    const split: { invoiceId: string; applied: number }[] = [];
    let remaining = amount;

    this.mutate((day) => {
      const openInvoices = day.openInvoices.map((inv) => {
        if (remaining <= 0 || inv.open <= 0) return inv;
        const applied = Math.min(inv.open, remaining);
        remaining -= applied;
        split.push({ invoiceId: inv.invoiceId, applied });
        return { ...inv, open: inv.open - applied };
      });

      return {
        ...day,
        openInvoices,
        visits: day.visits.map((v) =>
          v.id === visit.id ? { ...v, balance: Math.max(0, v.balance - amount) } : v
        ),
        kpi: { ...day.kpi, collected: day.kpi.collected + amount },
        outbox: { ...day.outbox, collections: day.outbox.collections + 1 },
      };
    });

    return split;
  }

  /** Books a return: credits the customer balance and adds to the day's returns. */
  applyReturn(value: number): void {
    const visit = this.currentVisit();
    if (!visit || value <= 0) return;

    this.mutate((day) => ({
      ...day,
      visits: day.visits.map((v) =>
        v.id === visit.id ? { ...v, balance: Math.max(0, v.balance - value) } : v
      ),
      kpi: { ...day.kpi, returns: day.kpi.returns + value },
      outbox: { ...day.outbox, returns: day.outbox.returns + 1 },
    }));
  }

  /** Closes the current visit without a sale, tagged with the driver's reason. */
  noSale(reason: string): void {
    const visit = this.currentVisit();
    if (!visit) return;
    this.mutate((day) => ({
      ...day,
      visits: day.visits.map((v) =>
        v.id === visit.id
          ? { ...v, status: 'done', outcome: `No sale — ${reason}` }
          : v
      ),
      lastCompletedVisitId: visit.id,
      kpi: {
        ...day.kpi,
        visited: day.kpi.visited + (visit.status === 'done' ? 0 : 1),
      },
    }));
  }

  /** Queues a submitted new-customer request in the outbox. */
  addCustomerRequest(): void {
    this.mutate((day) => ({
      ...day,
      outbox: { ...day.outbox, customerRequests: day.outbox.customerRequests + 1 },
    }));
  }

  // ── Sync & close ─────────────────────────────────────────────────────────

  /** Acknowledges the pending queue once D365 confirms. Returns the count synced. */
  markSynced(): number {
    const pending = this._day()?.outbox.pending ?? 0;
    if (pending > 0) {
      this.mutate((day) => ({
        ...day,
        outbox: { ...day.outbox, pending: 0 },
      }));
    }
    return pending;
  }

  closeDay(): void {
    this.mutate((day) => ({ ...day, open: false }));
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private patchVisit(id: number, patch: (v: VanVisit) => Partial<VanVisit>): void {
    this.mutate((day) => ({
      ...day,
      visits: day.visits.map((v) => (v.id === id ? { ...v, ...patch(v) } : v)),
    }));
  }

  private mutate(fn: (day: VanDay) => VanDay): void {
    const current = this._day();
    if (!current) return;
    this.setDay(fn(current));
  }

  private setDay(day: VanDay): void {
    this._day.set(day);
    this.persist(day);
  }

  private persist(day: VanDay): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(day));
    } catch {
      // Private mode or a full quota — the day still works for this session.
    }
  }

  private restore(): VanDay | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as VanDay;
      // Minimal shape check — a malformed blob falls back to a fresh seed.
      if (!parsed || !Array.isArray(parsed.visits) || !parsed.kpi) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
