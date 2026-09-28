import { Injectable } from '@angular/core';
import { defer, delay, Observable, of, throwError } from 'rxjs';
import { round2 } from './pricing-engine';
import { VanBusinessError, VanSalesApi } from './van-sales-api';
import { VanApiNo } from './van-sales-endpoints';
import {
  MOCK_BANKS,
  MOCK_CUSTOMERS,
  MOCK_JOURNEY,
  MOCK_LAST_PRICES,
  MOCK_LOYALTY,
  MOCK_ORDERS,
  MOCK_PRICES,
  MOCK_PRODUCTS,
  MOCK_PROMOTIONS,
  MOCK_REASONS,
  MOCK_REP_SETUP,
  MOCK_SURVEYS,
  MOCK_TAX_GROUPS,
  MOCK_VAN_STOCK,
} from './van-sales-mock.data';
import {
  ApprovalRequest,
  ApprovalStatus,
  ApprovalType,
  ChequeRecord,
  ChequeStatus,
  Customer,
  EDocStatus,
  SalesOrder,
  ServiceEnvelope,
  VanStockLine,
} from './van-sales.models';

const STORAGE_KEY = 'gp.vanSales.mockServer';
const LATENCY_MS = 250;

/** What the pretend D365 remembers between calls — and between reloads. */
interface MockServerState {
  customers: Customer[];
  vanStock: VanStockLine[];
  orders: SalesOrder[];
  approvals: ApprovalRequest[];
  cheques: ChequeRecord[];
  eDocs: { uuid: string; status: EDocStatus; qrPayload?: string }[];
  /** MobileTransId → DocumentId: the idempotency ledger. */
  posted: Record<string, string>;
  /** Every accepted write, oldest first — lets tests count what reached "D365". */
  log: { apiNo: number; mobileTransId: string; documentId: string }[];
}

type Body = Record<string, unknown>;

/**
 * An in-memory D365 that behaves like the real one where the UI can tell the
 * difference (spec §6.4): a repeated `MobileTransId` returns the original
 * document with `Duplicate: true`; credit, discount and free-return limits are
 * enforced server-side unless the request carries an approved `ApprovalId`;
 * a bounced cheque puts the customer on hold.
 *
 * State is kept in localStorage so a rep and a supervisor can take turns on
 * one device (via the dev role switcher) and see each other's work.
 */
@Injectable({ providedIn: 'root' })
export class VanSalesMockApi implements VanSalesApi {
  private state: MockServerState = this.restore() ?? this.seed();

  /** Wipes the pretend server back to the seed. Dev tools only. */
  resetServer(): void {
    this.state = this.seed();
    this.persist();
  }

  /** Accepted writes, for tests and the dev panel. */
  get log(): readonly { apiNo: number; mobileTransId: string; documentId: string }[] {
    return this.state.log;
  }

  // ── Pull ────────────────────────────────────────────────────────────────

  getRepSetup() { return this.ok({ ...MOCK_REP_SETUP }); }
  getJourney() { return this.ok(MOCK_JOURNEY.map((s) => ({ ...s }))); }
  getCustomers() { return this.ok(clone(this.state.customers)); }
  getProducts() { return this.ok(clone(MOCK_PRODUCTS)); }
  getPrices() { return this.ok(clone(MOCK_PRICES)); }
  getTaxGroups() { return this.ok(clone(MOCK_TAX_GROUPS)); }
  getReturnReasons() { return this.ok(clone(MOCK_REASONS)); }
  getPromotions() { return this.ok(clone(MOCK_PROMOTIONS)); }
  getSurveys() { return this.ok(clone(MOCK_SURVEYS)); }
  getLoyaltyRules() { return this.ok(clone(MOCK_LOYALTY)); }
  getBanks() { return this.ok([...MOCK_BANKS]); }
  getVanStock() { return this.ok(clone(this.state.vanStock)); }
  getOrders() { return this.ok(clone(this.state.orders)); }
  getLastPrices() { return this.ok(clone(MOCK_LAST_PRICES)); }

  // ── Online ──────────────────────────────────────────────────────────────

  getOpenInvoices(customerId: string) {
    return this.ok(clone(this.customer(customerId)?.openInvoices ?? []));
  }

  checkCredit(customerId: string) {
    const c = this.customer(customerId);
    return this.ok({
      creditLimit: c?.creditLimit ?? 0,
      overdue: c?.overdue ?? false,
      creditHold: c?.creditHold ?? false,
      holdReason: c?.holdReason,
    });
  }

  getLoyaltyBalance(customerId: string) {
    const c = this.customer(customerId);
    return this.ok(c?.loyalty ?? { points: 0, tier: 'Bronze' });
  }

  /** The mock trusts the device's arithmetic; the real #23 re-prices server-side. */
  calculatePrice(body: unknown) {
    const b = body as { NetAmount?: number; VAT?: number; Total?: number };
    return this.ok({ net: b.NetAmount ?? 0, vat: b.VAT ?? 0, total: b.Total ?? 0 });
  }

  // ── Queue ───────────────────────────────────────────────────────────────

  post(apiNo: VanApiNo, body: Body): Observable<ServiceEnvelope> {
    return defer(() => {
      const transId = String(body['MobileTransId'] ?? '');
      if (!transId) return throwError(() => new VanBusinessError('MobileTransId is required.'));

      const original = this.state.posted[transId];
      if (original !== undefined) {
        return of(envelope(transId, original, true));
      }

      try {
        const documentId = this.apply(apiNo, body);
        this.state.posted[transId] = documentId;
        this.state.log.push({ apiNo, mobileTransId: transId, documentId });
        this.persist();
        return of(envelope(transId, documentId, false));
      } catch (e) {
        return throwError(() => e);
      }
    }).pipe(delay(LATENCY_MS));
  }

  // ── Supervisor ──────────────────────────────────────────────────────────

  listApprovals() { return this.ok(clone(this.state.approvals)); }

  decideApproval(id: string, status: Exclude<ApprovalStatus, 'PENDING'>) {
    return defer(() => {
      const a = this.state.approvals.find((x) => x.id === id);
      if (!a) return throwError(() => new VanBusinessError(`Approval ${id} not found.`));
      if (a.status !== 'PENDING') return throwError(() => new VanBusinessError(`Approval ${id} is already ${a.status.toLowerCase()}.`));
      a.status = status;
      a.decidedAt = new Date().toISOString();
      this.persist();
      return of(clone(a));
    }).pipe(delay(LATENCY_MS));
  }

  listCheques() { return this.ok(clone(this.state.cheques)); }

  updateChequeStatus(receiptId: string, number: string, bank: string, status: ChequeStatus) {
    return defer(() => {
      const c = this.state.cheques.find((x) => x.receiptId === receiptId && x.number === number && x.bank === bank);
      if (!c) return throwError(() => new VanBusinessError(`Cheque ${number} not found.`));
      if (!allowedNext(c.status).includes(status)) {
        return throwError(() => new VanBusinessError(`A cheque that is ${label(c.status)} cannot move to ${label(status)}.`));
      }
      c.status = status;
      c.history.push({ status, at: new Date().toISOString() });
      if (status === 'BOUNCED') {
        const cust = this.customer(c.customerId);
        if (cust) {
          cust.creditHold = true;
          cust.holdReason = `Bounced cheque ${c.number} (${c.bank})`;
          cust.openInvoices.push({ invoiceId: `BNC-${c.number}`, date: today(), amount: c.amount });
        }
      }
      this.persist();
      return of(clone(c));
    }).pipe(delay(LATENCY_MS));
  }

  /** D365 Electronic Invoicing (#44) validates a submitted document on the first status read. */
  getEDocStatus(uuids: string[]) {
    return defer(() => {
      for (const d of this.state.eDocs) {
        if (uuids.includes(d.uuid) && d.status === 'SUBMITTED') {
          d.status = 'VALID';
          d.qrPayload = `MOCK-ETA|${d.uuid}`;
        }
      }
      this.persist();
      return of(this.state.eDocs.filter((d) => uuids.includes(d.uuid)).map((d) => ({ ...d })));
    }).pipe(delay(LATENCY_MS));
  }

  // ── The pretend X++ ─────────────────────────────────────────────────────

  private apply(apiNo: VanApiNo, b: Body): string {
    const kind = b['TaxDocKind'];
    if (b['EtaUuid'] && (kind === 'E_INVOICE' || kind === 'E_CREDIT_NOTE')) {
      this.state.eDocs.push({ uuid: String(b['EtaUuid']), status: 'SUBMITTED' });
    }
    switch (apiNo) {
      case 25: return this.postInvoice(b);
      case 24: return this.createOrder(b);
      case 26: return this.confirmDelivery(b);
      case 27:
      case 28: return this.postReturn(apiNo, b);
      case 29: return this.postCollection(b);
      case 30: return this.registerCheques(b);
      case 43: return this.issueEReceipt(b);
      case 90: return this.submitApproval(b);
      case 32: return this.receiveLoad(b);
      case 33: return this.unload(b);
      case 41: return this.closeDay(b);
      default:
        // Visit log, survey answers, attachments, loyalty, load request,
        // customer request, day close, sync log: accepted as-is.
        return String(b['DocumentId'] ?? b['ReceiptId'] ?? b['RequestId'] ?? `MOCK-${apiNo}-${this.state.log.length + 1}`);
    }
  }

  private postInvoice(b: Body): string {
    const cust = this.requireCustomer(b['CustAccount']);
    const total = num(b['Total']);
    const manualPct = num(b['ManualDiscountPct']);
    if (manualPct > MOCK_REP_SETUP.manualDiscountLimitPct) {
      this.requireApproval(b['ApprovalId'], 'EXTRA_DISCOUNT', `Extra discount of ${manualPct}% is over the ${MOCK_REP_SETUP.manualDiscountLimitPct}% limit.`);
    }
    if (b['PaymentMode'] === 'CREDIT') {
      const balance = cust.openInvoices.reduce((s, i) => s + i.amount, 0);
      const blocked = cust.paymentTerms === 'CASH' || cust.creditHold || cust.overdue || balance + total > cust.creditLimit;
      if (blocked) {
        this.requireApproval(b['CreditApprovalId'], 'CREDIT_OVERRIDE', `Credit is blocked for ${cust.id}.`);
      }
      cust.openInvoices.push({ invoiceId: String(b['InvoiceId']), date: today(), amount: total });
    }
    for (const line of (b['Lines'] as Body[]) ?? []) {
      this.takeStock(String(line['ItemId']), num(line['Qty']) + num(line['FreeQty']));
    }
    for (const free of (b['FreeGoods'] as Body[]) ?? []) {
      this.takeStock(String(free['ItemId']), num(free['Qty']));
    }
    this.earnPoints(cust, num(b['PointsEarned']), num(b['RedeemedPoints']));
    return String(b['InvoiceId']);
  }

  private createOrder(b: Body): string {
    const salesId = String(b['SalesId']);
    const lines = ((b['Lines'] as Body[]) ?? []).map((l) => ({
      itemId: String(l['ItemId']),
      qty: num(l['Qty']),
      freeQty: num(l['FreeQty']),
      unitPrice: num(l['UnitPrice']),
      lineDiscount: num(l['LineDisc']),
    }));
    this.state.orders.push({
      salesId,
      customerId: String(b['CustAccount']),
      createdAt: today(),
      requestedShipDate: String(b['RequestedShipDate'] ?? today()),
      payMode: b['PaymentMode'] === 'CASH' ? 'CASH' : 'CREDIT',
      lines,
      total: num(b['Total']),
      status: 'READY',
    });
    return salesId;
  }

  private confirmDelivery(b: Body): string {
    const order = this.state.orders.find((o) => o.salesId === b['SalesId']);
    if (!order) throw new VanBusinessError(`Order ${String(b['SalesId'])} not found.`);
    if (order.status !== 'READY') throw new VanBusinessError(`Order ${order.salesId} is already ${order.status.toLowerCase()}.`);
    if (!b['PODSigned']) throw new VanBusinessError('Proof of delivery must be signed.');
    const lines = (b['Lines'] as Body[]) ?? [];
    const delivered = lines.reduce((s, l) => s + num(l['DeliveredQty']), 0);
    const ordered = lines.reduce((s, l) => s + num(l['OrderedQty']), 0);
    order.status = delivered === 0 ? 'REJECTED' : delivered < ordered ? 'PARTIALLY_DELIVERED' : 'DELIVERED';
    for (const l of lines) this.takeStock(String(l['ItemId']), num(l['DeliveredQty']));
    const cust = this.requireCustomer(b['CustAccount']);
    if (b['PaymentMode'] === 'CREDIT' && num(b['Total']) > 0) {
      cust.openInvoices.push({ invoiceId: String(b['InvoiceId']), date: today(), amount: num(b['Total']) });
    }
    return String(b['InvoiceId']);
  }

  private postReturn(apiNo: 27 | 28, b: Body): string {
    const cust = this.requireCustomer(b['CustAccount']);
    const value = num(b['ValueInclVAT']);
    if (apiNo === 28 && value > MOCK_REP_SETUP.freeReturnLimitPerVisit) {
      this.requireApproval(b['ApprovalId'], 'FREE_RETURN', `Free return of ${value} is over the ${MOCK_REP_SETUP.freeReturnLimitPerVisit} limit.`);
    }
    if (b['Disposition'] === 'RESTOCK') {
      for (const l of (b['Lines'] as Body[]) ?? []) this.putStock(String(l['ItemId']), num(l['Qty']));
    }
    if (cust.paymentTerms === 'CREDIT' && value > 0) {
      cust.openInvoices.push({ invoiceId: String(b['ReturnId']), date: today(), amount: -value });
    }
    return String(b['ReturnId']);
  }

  private postCollection(b: Body): string {
    const cust = this.requireCustomer(b['CustAccount']);
    const settlement = (b['Settlement'] as Body[]) ?? [];
    const settled = round2(settlement.reduce((s, x) => s + num(x['Amount']), 0));
    if (settled - num(b['Amount']) > 0.01) throw new VanBusinessError('Settlement is more than the amount collected.');
    cust.openInvoices = cust.openInvoices
      .map((inv) => {
        const hit = settlement.find((s) => s['InvoiceId'] === inv.invoiceId);
        return hit ? { ...inv, amount: round2(inv.amount - num(hit['Amount'])) } : inv;
      })
      .filter((inv) => Math.abs(inv.amount) > 0.001);
    return String(b['ReceiptId']);
  }

  private registerCheques(b: Body): string {
    const receiptId = String(b['ReceiptId']);
    const customerId = String(b['CustAccount']);
    const at = new Date().toISOString();
    for (const c of (b['Cheques'] as Body[]) ?? []) {
      const number = String(c['ChequeNum']);
      const bank = String(c['Bank']);
      if (this.state.cheques.some((x) => x.number === number && x.bank === bank)) {
        throw new VanBusinessError(`Cheque ${number} from ${bank} is already registered.`);
      }
      this.state.cheques.push({
        receiptId,
        customerId,
        number,
        bank,
        dueDate: String(c['MaturityDate']),
        amount: num(c['Amount']),
        status: 'WITH_REP',
        history: [{ status: 'WITH_REP', at }],
      });
    }
    return receiptId;
  }

  /** Stands in for the ETA middleware. The QR payload is visibly a mock. */
  private issueEReceipt(b: Body): string {
    const uuid = String(b['uuid']);
    this.state.eDocs.push({ uuid, status: 'VALID', qrPayload: `MOCK-ETA|${uuid}|${String(b['receiptNumber'])}|${num(b['totalAmount'])}` });
    return uuid;
  }

  private submitApproval(b: Body): string {
    const id = String(b['id']);
    if (!this.state.approvals.some((a) => a.id === id)) {
      this.state.approvals.push({ ...(b as unknown as ApprovalRequest), status: 'PENDING' });
    }
    return id;
  }

  private receiveLoad(b: Body): string {
    for (const l of (b['Lines'] as Body[]) ?? []) this.putStock(String(l['ItemId']), num(l['Qty']));
    return String(b['TransferId'] ?? b['MobileTransId']);
  }

  private unload(b: Body): string {
    for (const l of (b['Lines'] as Body[]) ?? []) this.takeStock(String(l['ItemId']), num(l['Qty']), true);
    return String(b['UnloadId'] ?? b['MobileTransId']);
  }

  /** Day close hands every cheque the rep carries to treasury. */
  private closeDay(b: Body): string {
    const at = new Date().toISOString();
    for (const c of this.state.cheques.filter((x) => x.status === 'WITH_REP')) {
      c.status = 'HANDED_TO_TREASURY';
      c.history.push({ status: 'HANDED_TO_TREASURY', at });
    }
    return String(b['DayCloseId'] ?? b['MobileTransId']);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private requireApproval(id: unknown, type: ApprovalType, message: string): void {
    const a = this.state.approvals.find((x) => x.id === id);
    if (!a || a.type !== type || a.status !== 'APPROVED') throw new VanBusinessError(`${message} Supervisor approval required.`);
  }

  private customer(id: string): Customer | undefined {
    return this.state.customers.find((c) => c.id === id);
  }

  private requireCustomer(id: unknown): Customer {
    const c = this.customer(String(id));
    if (!c) throw new VanBusinessError(`Customer ${String(id)} not found.`);
    return c;
  }

  private takeStock(itemId: string, qty: number, lenient = false): void {
    if (qty <= 0) return;
    const line = this.state.vanStock.find((s) => s.itemId === itemId);
    if (!line || line.qty < qty) {
      if (lenient) {
        if (line) line.qty = 0;
        return;
      }
      throw new VanBusinessError(`Not enough ${itemId} on the van (${line?.qty ?? 0} left).`);
    }
    line.qty -= qty;
  }

  private putStock(itemId: string, qty: number): void {
    if (qty <= 0) return;
    const line = this.state.vanStock.find((s) => s.itemId === itemId);
    if (line) line.qty += qty;
    else this.state.vanStock.push({ itemId, qty });
  }

  private earnPoints(cust: Customer, earned: number, redeemed: number): void {
    if (!cust.loyalty) cust.loyalty = { points: 0, tier: 'Bronze' };
    cust.loyalty.points = Math.max(0, cust.loyalty.points + earned - redeemed);
    const tier = [...MOCK_LOYALTY.tiers].reverse().find((t) => cust.loyalty!.points >= t.minPoints);
    if (tier) cust.loyalty.tier = tier.name;
  }

  private ok<T>(value: T): Observable<T> {
    return of(value).pipe(delay(LATENCY_MS));
  }

  private seed(): MockServerState {
    return {
      customers: clone(MOCK_CUSTOMERS),
      vanStock: clone(MOCK_VAN_STOCK),
      orders: clone(MOCK_ORDERS).map((o) => ({
        ...o,
        total: round2(o.lines.reduce((s, l) => s + l.qty * l.unitPrice - l.lineDiscount, 0)),
      })),
      approvals: [],
      cheques: [],
      eDocs: [],
      posted: {},
      log: [],
    };
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Quota or private mode — the mock still works for this session.
    }
  }

  private restore(): MockServerState | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as MockServerState;
      return parsed && Array.isArray(parsed.customers) && parsed.posted ? parsed : null;
    } catch {
      return null;
    }
  }
}

/** The cheque lifecycle (F6). Bounce is only possible once deposited. */
export function allowedNext(status: ChequeStatus): ChequeStatus[] {
  switch (status) {
    case 'WITH_REP': return ['HANDED_TO_TREASURY'];
    case 'HANDED_TO_TREASURY': return ['DEPOSITED'];
    case 'DEPOSITED': return ['CLEARED', 'BOUNCED'];
    default: return [];
  }
}

function label(s: ChequeStatus): string {
  return s.toLowerCase().replace(/_/g, ' ');
}

function envelope(transId: string, documentId: string, duplicate: boolean): ServiceEnvelope {
  return { Success: true, Message: '', MobileTransId: transId, DocumentId: documentId, Duplicate: duplicate, Data: {} };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}
