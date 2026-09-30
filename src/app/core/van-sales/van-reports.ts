import { round2 } from './pricing-engine';
import { Customer, EDocStatus, PaymentMethod, VanDocument } from './van-sales.models';
import { localIsoDate } from './van-uuid';

/**
 * Van Sales reports — pure aggregations over the documents this device issued
 * and the customer balances it holds. No I/O and no clock of its own: the page
 * passes `today`, so the same inputs always produce the same report.
 *
 * Scope is deliberately the device's own documents (`VanDocumentsService`
 * keeps the most recent 400). A cross-rep, cross-day view belongs to D365
 * reporting, fed by the documents the outbox posts there.
 */

export type ReportPeriod = 'TODAY' | '7D' | '30D';

export interface ReportSlice {
  key: string;
  label: string;
  value: number;
  /** Secondary figure — units for products, documents for customers. */
  count?: number;
}

export interface VanReport {
  period: ReportPeriod;
  from: string;
  to: string;
  sales: { total: number; count: number; avgDrop: number; cash: number; credit: number; customers: number };
  orders: { total: number; count: number };
  returns: { total: number; count: number; byReason: ReportSlice[] };
  collections: { total: number; count: number; byMethod: ReportSlice[] };
  promotions: { discounts: number; freeUnits: number; pointsEarned: number; pointsRedeemed: number };
  byDay: ReportSlice[];
  /** The trend line's points: hourly for Today, daily otherwise. */
  trend: ReportSlice[];
  byProduct: ReportSlice[];
  byCustomer: ReportSlice[];
  eDocs: ReportSlice[];
}

const METHOD_LABEL: Record<PaymentMethod, string> = { CASH: 'Cash', PDC: 'Cheques', E_WALLET: 'E-wallet' };
const EDOC_LABEL: Record<EDocStatus, string> = {
  QUEUED: 'Queued',
  SUBMITTED: 'Submitted',
  VALID: 'Valid',
  REJECTED: 'Rejected',
  NOT_REQUIRED: 'Not required',
};

/** First and last day (inclusive, YYYY-MM-DD) a period covers, ending today. */
export function periodRange(period: ReportPeriod, today: string): { from: string; to: string; days: string[] } {
  const span = period === 'TODAY' ? 1 : period === '7D' ? 7 : 30;
  const end = new Date(`${today}T12:00:00`);
  const days: string[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(end.getDate() - i);
    days.push(localIsoDate(d));
  }
  return { from: days[0], to: days[days.length - 1], days };
}

/** Hours shown on Today's trend — a van's working day. */
export const TREND_HOURS = Array.from({ length: 15 }, (_, i) => i + 6);

/** The day the previous, equally long period ends on — for "vs previous" deltas. */
export function previousPeriodEnd(period: ReportPeriod, today: string): string {
  const span = period === 'TODAY' ? 1 : period === '7D' ? 7 : 30;
  const d = new Date(`${today}T12:00:00`);
  d.setDate(d.getDate() - span);
  return localIsoDate(d);
}

/** Percentage change, or null when there is nothing to compare against. */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** Largest `n` slices, with the rest folded into one "Other" slice — never a ninth colour. */
export function topN(slices: ReportSlice[], n: number): ReportSlice[] {
  const sorted = [...slices].sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;
  const rest = sorted.slice(n);
  return [
    ...sorted.slice(0, n),
    {
      key: '__other',
      label: `Other (${rest.length})`,
      value: round2(rest.reduce((s, x) => s + x.value, 0)),
      count: rest.reduce((s, x) => s + (x.count ?? 0), 0),
    },
  ];
}

function sum(docs: VanDocument[]): number {
  return round2(docs.reduce((s, d) => s + d.total, 0));
}

function group(entries: { key: string; label: string; value: number; count?: number }[]): ReportSlice[] {
  const map = new Map<string, ReportSlice>();
  for (const e of entries) {
    const cur = map.get(e.key) ?? { key: e.key, label: e.label, value: 0, count: 0 };
    cur.value = round2(cur.value + e.value);
    cur.count = (cur.count ?? 0) + (e.count ?? 0);
    map.set(e.key, cur);
  }
  return [...map.values()];
}

export function buildReport(documents: VanDocument[], period: ReportPeriod, today: string, top = 6): VanReport {
  const { from, to, days } = periodRange(period, today);
  const docs = documents.filter((d) => {
    const day = localIsoDate(new Date(d.createdAt));
    return day >= from && day <= to;
  });

  const sales = docs.filter((d) => d.type === 'INVOICE' || d.type === 'DELIVERY');
  const orders = docs.filter((d) => d.type === 'ORDER');
  const returns = docs.filter((d) => d.type === 'RETURN');
  const receipts = docs.filter((d) => d.type === 'RECEIPT');
  const salesTotal = sum(sales);

  const byDayMap = new Map(days.map((d) => [d, 0]));
  for (const d of sales) {
    const day = localIsoDate(new Date(d.createdAt));
    byDayMap.set(day, round2((byDayMap.get(day) ?? 0) + d.total));
  }

  const trend =
    period === 'TODAY'
      ? TREND_HOURS.map((h) => ({
          key: String(h),
          label: `${String(h).padStart(2, '0')}:00`,
          value: round2(sales.filter((d) => new Date(d.createdAt).getHours() === h).reduce((a, d) => a + d.total, 0)),
        }))
      : days.map((day) => ({ key: day, label: day, value: byDayMap.get(day) ?? 0 }));

  return {
    period,
    from,
    to,
    trend,
    sales: {
      total: salesTotal,
      count: sales.length,
      avgDrop: sales.length ? round2(salesTotal / sales.length) : 0,
      cash: sum(sales.filter((d) => d.payMode === 'CASH')),
      credit: sum(sales.filter((d) => d.payMode !== 'CASH')),
      customers: new Set(sales.map((d) => d.customerId)).size,
    },
    orders: { total: sum(orders), count: orders.length },
    returns: {
      total: sum(returns),
      count: returns.length,
      byReason: topN(
        group(returns.map((d) => ({ key: d.reasonCode ?? '—', label: d.reasonText ?? d.reasonCode ?? 'No reason', value: d.total, count: 1 }))),
        top
      ),
    },
    collections: {
      total: sum(receipts),
      count: receipts.length,
      // Fixed order, so each method keeps its colour whatever the amounts.
      byMethod: (['CASH', 'PDC', 'E_WALLET'] as PaymentMethod[]).map((m) => {
        const list = receipts.filter((d) => d.paymentMethod === m);
        return { key: m, label: METHOD_LABEL[m], value: sum(list), count: list.length };
      }),
    },
    promotions: {
      discounts: round2(sales.reduce((s, d) => s + d.discounts, 0)),
      freeUnits: sales.reduce((s, d) => s + d.lines.reduce((x, l) => x + l.freeQty, 0), 0),
      pointsEarned: sales.reduce((s, d) => s + (d.pointsEarned ?? 0), 0),
      pointsRedeemed: sales.reduce((s, d) => s + (d.pointsRedeemed ?? 0), 0),
    },
    byDay: days.map((day) => ({ key: day, label: day, value: byDayMap.get(day) ?? 0 })),
    byProduct: topN(
      group(
        sales.reduce<ReportSlice[]>(
          (all, d) => all.concat(d.lines.map((l) => ({ key: l.itemId, label: l.name, value: l.net, count: l.qty }))),
          []
        )
      ),
      top
    ),
    byCustomer: topN(
      group(sales.map((d) => ({ key: d.customerId, label: d.customerName, value: d.total, count: 1 }))),
      top
    ),
    eDocs: group(
      docs.filter((d) => d.taxDocKind).map((d) => ({ key: d.eDocStatus, label: EDOC_LABEL[d.eDocStatus], value: 1, count: 1 }))
    ),
  };
}

export interface AgingBucket {
  key: string;
  label: string;
  value: number;
  count: number;
}

/** Open receivables by days past due, credit notes excluded. */
export function agingBuckets(customers: Customer[], today: string): AgingBucket[] {
  const buckets: AgingBucket[] = [
    { key: 'current', label: 'Not due', value: 0, count: 0 },
    { key: '1-30', label: '1–30 days', value: 0, count: 0 },
    { key: '31-60', label: '31–60 days', value: 0, count: 0 },
    { key: '61-90', label: '61–90 days', value: 0, count: 0 },
    { key: '90+', label: '90+ days', value: 0, count: 0 },
  ];
  const now = Date.parse(`${today}T00:00:00`);
  for (const c of customers) {
    for (const inv of c.openInvoices) {
      if (inv.amount <= 0) continue;
      const due = Date.parse(`${(inv.dueDate ?? inv.date).slice(0, 10)}T00:00:00`);
      const late = Math.floor((now - due) / 86_400_000);
      const b = late <= 0 ? buckets[0] : late <= 30 ? buckets[1] : late <= 60 ? buckets[2] : late <= 90 ? buckets[3] : buckets[4];
      b.value = round2(b.value + inv.amount);
      b.count++;
    }
  }
  return buckets;
}

/** CSV for a set of documents — one row per document, for sharing with the office. */
export function documentsCsv(docs: VanDocument[]): string {
  const cell = (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v);
    // Leading = + - @ would be run as a formula by a spreadsheet.
    const safe = typeof v === 'string' && /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = ['Document', 'Type', 'Date', 'Customer', 'Customer name', 'Payment', 'Net', 'VAT', 'Total', 'E-doc status'];
  const rows = docs.map((d) =>
    [d.id, d.type, d.createdAt, d.customerId, d.customerName, d.paymentMethod ?? d.payMode ?? '', d.net, d.vat, d.total, d.eDocStatus]
      .map(cell)
      .join(',')
  );
  return [header.join(','), ...rows].join('\n');
}
