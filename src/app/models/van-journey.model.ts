// ── Van Journey Models ──────────────────────────────────────────────────────
// The driver works a planned route: a list of customer stops (a "journey"), each
// visited in turn. At a stop the driver checks in, then sells, collects payment,
// takes returns, or closes the visit with no sale — and at the end of the day
// reconciles cash and stock and closes the day.
//
// Maps to the IKK Foods "Van Sales — D365 Direct API" spec. Master data reads
// (journey plan, route customers) come from GP* OData entities; the posting
// actions map to the GPVanSalesGroup custom services. See van-field-ops.service.

/** Where a stop sits in the day: not yet reached, being served, or finished. */
export type VanVisitStatus = 'pending' | 'current' | 'done';

/** How the customer pays: on account (credit) or cash on delivery. */
export type VanPayMode = 'credit' | 'cod';

/**
 * One customer stop on the day's route.
 *
 * Read from `GPJourneyPlanEntity` / `GPRouteCustomerEntity` (spec §4.1, §4.6).
 * Balance and limit drive the on-device credit check before an invoice is
 * confirmed — no pricing logic lives on the device, but the credit ceiling is
 * shown so the driver isn't surprised at post time.
 */
export interface VanVisit {
  /** Stable sequence within the day's plan, also the map pin number. */
  id: number;
  /** D365 customer account, e.g. `CU-004512`. */
  account: string;
  name: string;
  /** Planned arrival time, display only. */
  eta: string;
  /** Delivery window, e.g. `9–12`. Empty for cash-only stops. */
  window: string;
  mode: VanPayMode;
  /** Open receivable balance in the customer's currency. */
  balance: number;
  /** Credit limit; 0 for cash customers. */
  limit: number;
  status: VanVisitStatus;
  /** Set once the visit is finished, e.g. `Sold`, `Collected`, `No sale — closed`. */
  outcome?: string;
  /** True after a GPS check-in inside the geofence — gates the visit actions. */
  checkedIn: boolean;
  /** Flagged priority stop (overdue balance, key account). */
  priority?: boolean;
  /** Pin position for the schematic route map (arbitrary units, not real GPS). */
  lat: number;
  lng: number;
}

/** The day's key numbers, shown on the journey header and day-close. */
export interface VanJourneyKpi {
  planned: number;
  visited: number;
  sales: number;
  collected: number;
  returns: number;
  /** Route-order adherence %, 0–100. */
  adherence: number;
  kmPlanned: number;
  kmActual: number;
}

/**
 * Pending documents waiting to reach D365. The spec is "always online", so this
 * is normally all-posted; it still models the queue so a dropped connection
 * degrades gracefully and day-close can block on unsynced work.
 */
export interface VanOutbox {
  invoices: number;
  collections: number;
  returns: number;
  customerRequests: number;
  /** Count still not acknowledged by D365. */
  pending: number;
}

/** An open invoice available to settle a collection against (oldest first). */
export interface VanOpenInvoice {
  invoiceId: string;
  date: string;
  amount: number;
  /** Remaining unpaid amount. */
  open: number;
}

/** The day the driver is working: route + running totals + queue. */
export interface VanDay {
  routeId: string;
  visits: VanVisit[];
  kpi: VanJourneyKpi;
  outbox: VanOutbox;
  openInvoices: VanOpenInvoice[];
  /** False once the day is closed and reconciled. */
  open: boolean;
}
