import { round2 } from './pricing-engine';
import { MOCK_BANKS, MOCK_CUSTOMERS, MOCK_PRICE_GROUP_FACTORS, MOCK_PRODUCTS, MOCK_REASONS, MOCK_TAX_GROUPS } from './van-sales-mock.data';
import { ChequeRecord, ChequeStatus, DocumentLine, EDocStatus, PaymentMethod, Product, VanDocument } from './van-sales.models';
import { localIsoDate } from './van-uuid';

/**
 * Static demo activity for the reports dashboard — sixty days of a plausible
 * van round, so every period and its "vs previous" comparison has something to
 * show before a single real document exists.
 *
 * Seeded and deterministic: the same `today` always yields the same history,
 * so a demo looks identical on every device and every reload. Demo documents
 * are never stored and never queued — they exist only inside the report.
 */

export const DEMO_DAYS = 60;
export const DEMO_PREFIX = 'DEMO-';

export interface DemoActivity {
  documents: VanDocument[];
  cheques: ChequeRecord[];
}

/** mulberry32 — small, fast, and good enough to make fake sales look random. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const cache = new Map<string, DemoActivity>();

export function demoActivity(today: string): DemoActivity {
  const hit = cache.get(today);
  if (hit) return hit;
  const result = generate(today);
  cache.clear();
  cache.set(today, result);
  return result;
}

function generate(today: string): DemoActivity {
  const rand = rng(seedOf(`van-demo:${today}`));
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const vatOf = (taxGroup: string) => MOCK_TAX_GROUPS.find((t) => t.code === taxGroup)?.ratePct ?? 0;

  // A few products sell far more than the rest, like a real route.
  const weights = [5, 3, 6, 4, 3, 2, 2, 1];
  const weighted: Product[] = [];
  MOCK_PRODUCTS.forEach((p, i) => {
    for (let w = 0; w < (weights[i] ?? 1); w++) weighted.push(p);
  });

  const documents: VanDocument[] = [];
  const cheques: ChequeRecord[] = [];
  const counters = { inv: 0, rc: 0, rt: 0, so: 0 };
  const end = new Date(`${today}T12:00:00`);
  const nowMs = Date.now();

  for (let back = DEMO_DAYS - 1; back >= 0; back--) {
    const day = new Date(end);
    day.setDate(end.getDate() - back);
    // Friday is the weekend on this route; Saturday runs light.
    const weekday = day.getDay();
    if (weekday === 5) continue;
    const iso = localIsoDate(day);
    // A gentle upward drift, so "vs previous period" has a story to tell.
    const growth = 0.85 + ((DEMO_DAYS - back) / DEMO_DAYS) * 0.3;
    const busy = weekday === 6 ? 0.6 : 1;

    const at = (hourLo: number, hourHi: number) => {
      const d = new Date(`${iso}T00:00:00`);
      d.setHours(between(hourLo, hourHi), between(0, 59), between(0, 59));
      return d;
    };
    // Today's history stops at the current time.
    const future = (d: Date) => back === 0 && d.getTime() > nowMs;

    // ── Invoices ─────────────────────────────────────────────────────────
    const invoiceCount = Math.round(between(5, 9) * busy);
    for (let i = 0; i < invoiceCount; i++) {
      const when = at(8, 17);
      if (future(when)) continue;
      const customer = pick(MOCK_CUSTOMERS);
      const factor = MOCK_PRICE_GROUP_FACTORS[customer.priceGroup] ?? 1;
      const lineCount = between(2, 5);
      const lines: DocumentLine[] = [];
      let vat = 0;
      for (let l = 0; l < lineCount; l++) {
        const p = pick(weighted);
        if (lines.some((x) => x.itemId === p.itemId)) continue;
        const qty = Math.max(1, Math.round(between(4, 30) * growth));
        const unitPrice = round2(p.basePrice * factor);
        const gross = round2(qty * unitPrice);
        const lineDiscount = qty >= 24 ? round2(gross * 0.05) : 0;
        const net = round2(gross - lineDiscount);
        vat = round2(vat + round2((net * vatOf(p.taxGroup)) / 100));
        lines.push({
          itemId: p.itemId,
          name: p.name,
          qty,
          freeQty: p.itemId === '1003' ? Math.floor(qty / 10) : 0,
          unitPrice,
          lineDiscount,
          net,
          promoLabel: p.itemId === '1003' && qty >= 10 ? `+${Math.floor(qty / 10)} free` : undefined,
        });
      }
      const gross = round2(lines.reduce((s, l) => s + l.qty * l.unitPrice, 0));
      const net = round2(lines.reduce((s, l) => s + l.net, 0));
      const total = round2(net + vat);
      const age = back;
      const eDocStatus: EDocStatus =
        age === 0 ? pick<EDocStatus>(['QUEUED', 'SUBMITTED', 'VALID', 'VALID']) : rand() < 0.03 ? 'REJECTED' : 'VALID';
      documents.push({
        id: `${DEMO_PREFIX}VI-${String(++counters.inv).padStart(4, '0')}`,
        type: rand() < 0.2 ? 'DELIVERY' : 'INVOICE',
        customerId: customer.id,
        customerName: customer.name,
        createdAt: when.toISOString(),
        payMode: customer.paymentTerms,
        lines,
        gross,
        discounts: round2(gross - net),
        net,
        vat,
        total,
        pointsEarned: Math.floor(net * 0.01),
        pointsRedeemed: rand() < 0.08 ? between(100, 400) : 0,
        taxDocKind: customer.taxId ? 'E_INVOICE' : 'E_RECEIPT',
        eDocStatus,
        mobileTransId: 'demo',
      });
    }

    // ── Collections ──────────────────────────────────────────────────────
    const receiptCount = Math.round(between(2, 5) * busy);
    for (let i = 0; i < receiptCount; i++) {
      const when = at(9, 18);
      if (future(when)) continue;
      const customer = pick(MOCK_CUSTOMERS.filter((c) => c.paymentTerms === 'CREDIT'));
      const roll = rand();
      const method: PaymentMethod = roll < 0.55 ? 'CASH' : roll < 0.85 ? 'PDC' : 'E_WALLET';
      const amount = round2(between(8, 60) * 100 * growth);
      const id = `${DEMO_PREFIX}RC-${String(++counters.rc).padStart(4, '0')}`;
      // One cheque, or the amount split across two.
      const split = method !== 'PDC' ? [] : rand() < 0.3 ? [round2(amount / 2), round2(amount - round2(amount / 2))] : [amount];
      const docCheques = split.map((chequeAmount) => ({
        bank: pick(MOCK_BANKS),
        number: String(between(100000, 999999)),
        dueDate: localIsoDate(new Date(when.getTime() + between(10, 60) * 86_400_000)),
        amount: chequeAmount,
      }));
      for (const c of docCheques) {
        const status: ChequeStatus =
          back < 1 ? 'WITH_REP' : back < 4 ? 'HANDED_TO_TREASURY' : back < 12 ? 'DEPOSITED' : rand() < 0.05 ? 'BOUNCED' : 'CLEARED';
        const steps: ChequeStatus[] = ['WITH_REP', 'HANDED_TO_TREASURY', 'DEPOSITED', status === 'BOUNCED' ? 'BOUNCED' : 'CLEARED'];
        const reached = steps.slice(0, steps.indexOf(status) + 1);
        cheques.push({
          bank: c.bank,
          number: c.number,
          dueDate: c.dueDate,
          amount: c.amount,
          receiptId: id,
          customerId: customer.id,
          status,
          history: reached.map((s, k) => ({ status: s, at: new Date(when.getTime() + k * 2 * 86_400_000).toISOString() })),
        });
      }
      documents.push({
        id,
        type: 'RECEIPT',
        customerId: customer.id,
        customerName: customer.name,
        createdAt: when.toISOString(),
        lines: [],
        gross: amount,
        discounts: 0,
        net: amount,
        vat: 0,
        total: amount,
        paymentMethod: method,
        walletRef: method === 'E_WALLET' ? `WLT-${between(10000, 99999)}` : undefined,
        cheques: docCheques,
        eDocStatus: 'NOT_REQUIRED',
        mobileTransId: 'demo',
      });
    }

    // ── Returns ──────────────────────────────────────────────────────────
    const returnCount = rand() < 0.55 ? between(1, 2) : 0;
    for (let i = 0; i < returnCount; i++) {
      const when = at(10, 17);
      if (future(when)) continue;
      const customer = pick(MOCK_CUSTOMERS);
      const reason = pick([...MOCK_REASONS, MOCK_REASONS[1], MOCK_REASONS[0]]);
      const p = pick(weighted);
      const qty = between(1, 8);
      const net = round2(qty * p.basePrice);
      const total = round2(net * (1 + vatOf(p.taxGroup) / 100));
      documents.push({
        id: `${DEMO_PREFIX}RT-${String(++counters.rt).padStart(4, '0')}`,
        type: 'RETURN',
        customerId: customer.id,
        customerName: customer.name,
        createdAt: when.toISOString(),
        lines: [{ itemId: p.itemId, name: p.name, qty, freeQty: 0, unitPrice: p.basePrice, lineDiscount: 0, net }],
        gross: net,
        discounts: 0,
        net,
        vat: round2(total - net),
        total,
        reasonCode: reason.code,
        reasonText: reason.description,
        disposition: reason.disposition,
        taxDocKind: customer.taxId ? 'E_CREDIT_NOTE' : 'E_RECEIPT_RETURN',
        eDocStatus: back === 0 ? 'QUEUED' : 'VALID',
        mobileTransId: 'demo',
      });
    }

    // ── Pre-sales orders ─────────────────────────────────────────────────
    const orderCount = Math.round(between(1, 3) * busy);
    for (let i = 0; i < orderCount; i++) {
      const when = at(8, 15);
      if (future(when)) continue;
      const customer = pick(MOCK_CUSTOMERS);
      const p = pick(weighted);
      const qty = between(10, 48);
      const net = round2(qty * p.basePrice);
      const total = round2(net * (1 + vatOf(p.taxGroup) / 100));
      documents.push({
        id: `${DEMO_PREFIX}SO-${String(++counters.so).padStart(4, '0')}`,
        type: 'ORDER',
        customerId: customer.id,
        customerName: customer.name,
        createdAt: when.toISOString(),
        payMode: customer.paymentTerms,
        lines: [{ itemId: p.itemId, name: p.name, qty, freeQty: 0, unitPrice: p.basePrice, lineDiscount: 0, net }],
        gross: net,
        discounts: 0,
        net,
        vat: round2(total - net),
        total,
        eDocStatus: 'NOT_REQUIRED',
        mobileTransId: 'demo',
      });
    }
  }

  return { documents, cheques };
}
