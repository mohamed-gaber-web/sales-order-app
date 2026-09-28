import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, forkJoin, Observable, of } from 'rxjs';
import { VanDayService } from '../services/van-day.service';
import { NetworkStatusService } from './network-status.service';
import { round2 } from './pricing-engine';
import { VanApprovalService } from './van-approval.service';
import { VanAttachmentService } from './van-attachment.service';
import { VanDocumentsService } from './van-documents.service';
import { VanOutboxService } from './van-outbox.service';
import { VanSalesApiRouter } from './van-sales-api.router';
import { applySettlement, returnValueInclVat, taxDocKindFor } from './van-rules';
import {
  ApprovalRequest,
  Cheque,
  ChequeRecord,
  Customer,
  DocumentLine,
  PaymentMethod,
  PayMode,
  PricingResult,
  ReturnReason,
  SalesOrder,
  SurveyAnswer,
  SurveyDefinition,
  VanDocument,
  VanStockLine,
} from './van-sales.models';
import { VanStoreService } from './van-store.service';
import { localIsoDate, uuidV4 } from './van-uuid';

export interface Position {
  lat: number;
  lng: number;
}

export interface InvoiceInput {
  customer: Customer;
  pricing: PricingResult;
  payMode: PayMode;
  discountApprovalId?: string;
  creditApprovalId?: string;
  position?: Position | null;
}

export interface OrderInput {
  customer: Customer;
  pricing: PricingResult;
  payMode: PayMode;
  requestedShipDate: string;
  discountApprovalId?: string;
  creditApprovalId?: string;
}

export interface DeliveryInput {
  order: SalesOrder;
  /** itemId → delivered quantity (≤ ordered). */
  delivered: Record<string, number>;
  rejectReason?: string;
  payMode: PayMode;
  signatureDataUrl: string;
}

export interface ReturnInput {
  customerId: string;
  type: 'AgainstInvoice' | 'Free';
  originalInvoice?: string;
  reasonCode: string;
  lines: { itemId: string; qty: number; price: number }[];
  approvalId?: string;
}

export interface CollectionInput {
  customer: Customer;
  method: PaymentMethod;
  amount: number;
  settlement: { invoiceId: string; amount: number }[];
  cheques?: (Cheque & { photoDataUrl?: string })[];
  walletRef?: string;
}

export type VisitEvent = 'CheckIn' | 'CheckInRejected' | 'CheckOut' | 'NoSale' | 'GeofenceOverride';

/**
 * Every write in the van cycle, in one place (spec §6–§9).
 *
 * Each method does the same four things, in the same order, so no screen can
 * forget one: number the document, queue its outbox calls (with dependencies),
 * apply the result locally at once (stock, balances, points, the day's KPIs),
 * and store the document for the receipt screen. Nothing here waits for the
 * network — a rep can post a whole round offline.
 */
@Injectable({ providedIn: 'root' })
export class VanTransactionsService {
  private readonly store = inject(VanStoreService);
  private readonly outbox = inject(VanOutboxService);
  private readonly docs = inject(VanDocumentsService);
  private readonly approvals = inject(VanApprovalService);
  private readonly attachments = inject(VanAttachmentService);
  private readonly day = inject(VanDayService);
  private readonly api = inject(VanSalesApiRouter);
  private readonly network = inject(NetworkStatusService);

  /** The last document posted automatically after an approval — for a toast. */
  readonly autoPosted = signal<VanDocument | null>(null);

  constructor() {
    // Spec §7.5: once a free return over the limit is approved, it posts itself.
    this.approvals.onApproved('FREE_RETURN', (a) => this.postApprovedFreeReturn(a));
  }

  // ── Selling ──────────────────────────────────────────────────────────────

  postInvoice(input: InvoiceInput): VanDocument {
    const { customer, pricing, payMode } = input;
    const rep = this.store.repSetup();
    const invoiceId = this.docs.nextNumber('invoice');
    const mobileTransId = uuidV4();
    const taxDocKind = taxDocKindFor(customer, false);
    const etaUuid = uuidV4();

    const otherFree = pricing.lines
      .filter((l) => l.freeItemId && l.freeQty > 0)
      .map((l) => ({ ItemId: l.freeItemId, Qty: l.freeQty }));

    this.outbox.enqueue({
      apiNo: 25,
      label: 'Invoices',
      mobileTransId,
      body: {
        InvoiceId: invoiceId,
        CustAccount: customer.id,
        Warehouse: rep?.vanWarehouse,
        PaymentMode: payMode,
        Lines: pricing.lines.map((l) => ({
          ItemId: l.itemId,
          Qty: l.qty,
          FreeQty: l.freeItemId ? 0 : l.freeQty,
          UnitPrice: l.unitPrice,
          LineDisc: l.lineDiscount,
          PromoIds: l.promoIds,
        })),
        FreeGoods: otherFree,
        InvoiceDiscount: pricing.invoiceDiscount,
        ManualDiscountPct: pricing.manualDiscountPct,
        ApprovalId: input.discountApprovalId ?? null,
        CreditApprovalId: input.creditApprovalId ?? null,
        RedeemedPoints: pricing.redeemedPoints,
        PointsEarned: pricing.pointsToEarn,
        NetAmount: pricing.net,
        VAT: pricing.vat,
        Total: pricing.total,
        TaxDocKind: taxDocKind,
        EtaUuid: etaUuid,
        Lat: input.position?.lat ?? null,
        Lon: input.position?.lng ?? null,
      },
    });
    this.queueTaxFollowUps(mobileTransId, taxDocKind, etaUuid, invoiceId, 'Sale', pricing.total);
    if (pricing.pointsToEarn || pricing.redeemedPoints) {
      this.outbox.enqueue({
        apiNo: 39,
        label: 'Loyalty',
        dependsOn: [mobileTransId],
        body: { CustAccount: customer.id, DocumentId: invoiceId, Earned: pricing.pointsToEarn, Redeemed: pricing.redeemedPoints },
      });
    }

    // Local effects — stock, balance, points.
    for (const l of pricing.lines) this.store.adjustStock(l.itemId, -l.qty);
    for (const f of pricing.freeGoods) this.store.adjustStock(f.itemId, -f.qty);
    this.store.patchCustomer(customer.id, (c) => ({
      ...c,
      openInvoices:
        payMode === 'CREDIT'
          ? [...c.openInvoices, { invoiceId, date: localIsoDate(), amount: pricing.total }]
          : c.openInvoices,
      loyalty: c.loyalty
        ? { ...c.loyalty, points: Math.max(0, c.loyalty.points + pricing.pointsToEarn - pricing.redeemedPoints) }
        : pricing.pointsToEarn
          ? { points: pricing.pointsToEarn, tier: 'Bronze' }
          : undefined,
    }));
    if (input.discountApprovalId) this.approvals.consume(input.discountApprovalId);
    if (input.creditApprovalId) this.approvals.consume(input.creditApprovalId);

    const doc: VanDocument = {
      id: invoiceId,
      type: 'INVOICE',
      customerId: customer.id,
      customerName: customer.name,
      createdAt: new Date().toISOString(),
      payMode,
      lines: this.documentLines(pricing),
      gross: pricing.gross,
      discounts: round2(pricing.lineDiscount + pricing.invoiceDiscount + pricing.manualDiscount + pricing.redeemedValue),
      net: pricing.net,
      vat: pricing.vat,
      total: pricing.total,
      pointsEarned: pricing.pointsToEarn,
      pointsRedeemed: pricing.redeemedPoints,
      taxDocKind,
      etaUuid,
      eDocStatus: 'QUEUED',
      mobileTransId,
    };
    this.docs.add(doc);
    this.day.recordActivity(customer.id, {
      outcome: 'Sold',
      done: true,
      sales: pricing.total,
      balance: this.store.balanceOf(customer.id),
    });
    return doc;
  }

  createOrder(input: OrderInput): VanDocument {
    const { customer, pricing, payMode } = input;
    const salesId = this.docs.nextNumber('order');
    const mobileTransId = uuidV4();
    this.outbox.enqueue({
      apiNo: 24,
      label: 'Orders',
      mobileTransId,
      body: {
        SalesId: salesId,
        CustAccount: customer.id,
        PaymentMode: payMode,
        RequestedShipDate: input.requestedShipDate,
        Lines: pricing.lines.map((l) => ({
          ItemId: l.itemId,
          Qty: l.qty,
          FreeQty: l.freeItemId ? 0 : l.freeQty,
          UnitPrice: l.unitPrice,
          LineDisc: l.lineDiscount,
          PromoIds: l.promoIds,
        })),
        InvoiceDiscount: pricing.invoiceDiscount,
        ManualDiscountPct: pricing.manualDiscountPct,
        ApprovalId: input.discountApprovalId ?? null,
        CreditApprovalId: input.creditApprovalId ?? null,
        NetAmount: pricing.net,
        VAT: pricing.vat,
        Total: pricing.total,
      },
    });
    if (input.discountApprovalId) this.approvals.consume(input.discountApprovalId);
    if (input.creditApprovalId) this.approvals.consume(input.creditApprovalId);
    this.store.upsertOrder({
      salesId,
      customerId: customer.id,
      createdAt: localIsoDate(),
      requestedShipDate: input.requestedShipDate,
      payMode,
      lines: pricing.lines.map((l) => ({
        itemId: l.itemId,
        qty: l.qty,
        freeQty: l.freeItemId ? 0 : l.freeQty,
        unitPrice: l.unitPrice,
        lineDiscount: l.lineDiscount,
      })),
      total: pricing.total,
      status: 'READY',
      local: true,
    });
    const doc: VanDocument = {
      id: salesId,
      type: 'ORDER',
      customerId: customer.id,
      customerName: customer.name,
      createdAt: new Date().toISOString(),
      payMode,
      lines: this.documentLines(pricing),
      gross: pricing.gross,
      discounts: round2(pricing.lineDiscount + pricing.invoiceDiscount + pricing.manualDiscount),
      net: pricing.net,
      vat: pricing.vat,
      total: pricing.total,
      eDocStatus: 'NOT_REQUIRED',
      mobileTransId,
    };
    this.docs.add(doc);
    this.day.recordActivity(customer.id, { outcome: 'Order taken', done: true, sales: pricing.total });
    return doc;
  }

  /** Online price check against D365 (#23). `null` when offline or unavailable. */
  verifyPricing(customer: Customer, pricing: PricingResult): Observable<{ net: number; vat: number; total: number } | null> {
    if (!this.network.online()) return of(null);
    return this.api
      .calculatePrice({
        CustAccount: customer.id,
        Lines: pricing.lines.map((l) => ({ ItemId: l.itemId, Qty: l.qty })),
        ManualDiscountPct: pricing.manualDiscountPct,
        RedeemedPoints: pricing.redeemedPoints,
        NetAmount: pricing.net,
        VAT: pricing.vat,
        Total: pricing.total,
      });
  }

  // ── Delivery ─────────────────────────────────────────────────────────────

  async confirmDelivery(input: DeliveryInput): Promise<VanDocument> {
    const { order } = input;
    const customer = this.store.customer(order.customerId);
    if (!customer) throw new Error(`Customer ${order.customerId} is not on this route.`);

    const invoiceId = this.docs.nextNumber('invoice');
    const mobileTransId = uuidV4();
    const taxDocKind = taxDocKindFor(customer, false);
    const etaUuid = uuidV4();

    const lines: DocumentLine[] = [];
    let gross = 0;
    let discounts = 0;
    let vat = 0;
    for (const l of order.lines) {
      const delivered = Math.max(0, Math.min(l.qty, input.delivered[l.itemId] ?? 0));
      const share = l.qty ? delivered / l.qty : 0;
      const lineGross = round2(delivered * l.unitPrice);
      const lineDisc = round2(l.lineDiscount * share);
      const lineNet = round2(lineGross - lineDisc);
      gross = round2(gross + lineGross);
      discounts = round2(discounts + lineDisc);
      vat = round2(vat + round2((lineNet * this.store.vatPctOf(l.itemId)) / 100));
      lines.push({
        itemId: l.itemId,
        name: this.store.productName(l.itemId),
        qty: delivered,
        freeQty: Math.floor(l.freeQty * share),
        unitPrice: l.unitPrice,
        lineDiscount: lineDisc,
        net: lineNet,
      });
    }
    const net = round2(gross - discounts);
    const total = round2(net + vat);
    const deliveredQty = lines.reduce((s, l) => s + l.qty, 0);
    const orderedQty = order.lines.reduce((s, l) => s + l.qty, 0);
    const status: SalesOrder['status'] =
      deliveredQty === 0 ? 'REJECTED' : deliveredQty < orderedQty ? 'PARTIALLY_DELIVERED' : 'DELIVERED';

    const signatureId = await this.attachments.save(input.signatureDataUrl);

    this.outbox.enqueue({
      apiNo: 26,
      label: 'Deliveries',
      mobileTransId,
      body: {
        SalesId: order.salesId,
        InvoiceId: invoiceId,
        CustAccount: customer.id,
        PaymentMode: input.payMode,
        Lines: order.lines.map((l) => ({
          ItemId: l.itemId,
          OrderedQty: l.qty,
          DeliveredQty: lines.find((x) => x.itemId === l.itemId)?.qty ?? 0,
        })),
        RejectReason: input.rejectReason || null,
        PODSigned: true,
        Total: total,
        TaxDocKind: deliveredQty ? taxDocKind : null,
        EtaUuid: deliveredQty ? etaUuid : null,
      },
    });
    this.outbox.enqueue({
      apiNo: 38,
      label: 'Attachments',
      dependsOn: [mobileTransId],
      body: { AttachmentId: signatureId, ParentDocumentId: invoiceId, Kind: 'POD_SIGNATURE', FileName: `${invoiceId}-signature.png` },
    });
    if (deliveredQty) this.queueTaxFollowUps(mobileTransId, taxDocKind, etaUuid, invoiceId, 'Sale', total);

    // Only what left the van comes off the van.
    for (const l of lines) this.store.adjustStock(l.itemId, -(l.qty + l.freeQty));
    this.store.upsertOrder({ ...order, status });
    if (input.payMode === 'CREDIT' && total > 0) {
      this.store.patchCustomer(customer.id, (c) => ({
        ...c,
        openInvoices: [...c.openInvoices, { invoiceId, date: localIsoDate(), amount: total }],
      }));
    }

    const doc: VanDocument = {
      id: invoiceId,
      type: 'DELIVERY',
      customerId: customer.id,
      customerName: customer.name,
      createdAt: new Date().toISOString(),
      payMode: input.payMode,
      lines,
      gross,
      discounts,
      net,
      vat,
      total,
      salesId: order.salesId,
      rejectReason: input.rejectReason,
      signatureId,
      taxDocKind: deliveredQty ? taxDocKind : undefined,
      etaUuid: deliveredQty ? etaUuid : undefined,
      eDocStatus: deliveredQty ? 'QUEUED' : 'NOT_REQUIRED',
      mobileTransId,
    };
    this.docs.add(doc);
    this.day.recordActivity(customer.id, {
      outcome: status === 'DELIVERED' ? 'Delivered' : status === 'REJECTED' ? 'Delivery rejected' : 'Partially delivered',
      done: true,
      sales: total,
      balance: this.store.balanceOf(customer.id),
    });
    return doc;
  }

  // ── Returns ──────────────────────────────────────────────────────────────

  returnValue(lines: ReturnInput['lines']): number {
    return returnValueInclVat(lines.map((l) => ({ ...l, vatPct: this.store.vatPctOf(l.itemId) })));
  }

  postReturn(input: ReturnInput): VanDocument {
    const customer = this.store.customer(input.customerId);
    if (!customer) throw new Error(`Customer ${input.customerId} is not on this route.`);
    const reason = this.reason(input.reasonCode);
    const returnId = this.docs.nextNumber('return');
    const mobileTransId = uuidV4();
    const taxDocKind = taxDocKindFor(customer, true);
    const etaUuid = uuidV4();
    const lines = input.lines.filter((l) => l.qty > 0);
    const valueInclVat = this.returnValue(lines);
    const net = round2(lines.reduce((s, l) => s + round2(l.qty * l.price), 0));

    this.outbox.enqueue({
      apiNo: input.type === 'Free' ? 28 : 27,
      label: 'Returns',
      mobileTransId,
      body: {
        ReturnId: returnId,
        CustAccount: customer.id,
        ReturnType: input.type,
        OriginalInvoice: input.originalInvoice ?? null,
        ReasonCode: reason.code,
        Disposition: reason.disposition,
        ApprovalId: input.approvalId ?? null,
        Lines: lines.map((l) => ({ ItemId: l.itemId, Qty: l.qty, Price: l.price })),
        ValueInclVAT: valueInclVat,
        TaxDocKind: taxDocKind,
        EtaUuid: etaUuid,
      },
    });
    this.queueTaxFollowUps(mobileTransId, taxDocKind, etaUuid, returnId, 'Return', valueInclVat);

    for (const l of lines) {
      if (reason.sellable) this.store.adjustStock(l.itemId, l.qty);
      else this.store.addDamaged(l.itemId, l.qty);
    }
    if (customer.paymentTerms === 'CREDIT') {
      this.store.patchCustomer(customer.id, (c) => ({
        ...c,
        openInvoices: [...c.openInvoices, { invoiceId: returnId, date: localIsoDate(), amount: -valueInclVat }],
      }));
    }
    if (input.approvalId) this.approvals.consume(input.approvalId);

    const doc: VanDocument = {
      id: returnId,
      type: 'RETURN',
      customerId: customer.id,
      customerName: customer.name,
      createdAt: new Date().toISOString(),
      lines: lines.map((l) => ({
        itemId: l.itemId,
        name: this.store.productName(l.itemId),
        qty: l.qty,
        freeQty: 0,
        unitPrice: l.price,
        lineDiscount: 0,
        net: round2(l.qty * l.price),
      })),
      gross: net,
      discounts: 0,
      net,
      vat: round2(valueInclVat - net),
      total: valueInclVat,
      reasonCode: reason.code,
      reasonText: reason.description,
      disposition: reason.disposition,
      originalInvoice: input.originalInvoice,
      taxDocKind,
      etaUuid,
      eDocStatus: 'QUEUED',
      mobileTransId,
    };
    this.docs.add(doc);
    this.day.recordActivity(customer.id, {
      outcome: 'Return',
      returns: valueInclVat,
      balance: this.store.balanceOf(customer.id),
    });
    return doc;
  }

  /** Over the free-return limit: park the return with the supervisor. It posts itself on approval. */
  requestFreeReturnApproval(input: ReturnInput): ApprovalRequest {
    const value = this.returnValue(input.lines);
    const limit = this.store.repSetup()?.freeReturnLimitPerVisit ?? 0;
    return this.approvals.request(
      'FREE_RETURN',
      input.customerId,
      `Free return of ${value} incl. VAT (limit ${limit})`,
      { ...input, type: 'Free' }
    );
  }

  private postApprovedFreeReturn(a: ApprovalRequest): void {
    const input = a.payload as ReturnInput | undefined;
    if (!input?.lines?.length) return;
    const doc = this.postReturn({ ...input, type: 'Free', approvalId: a.id });
    this.autoPosted.set(doc);
  }

  // ── Money in ─────────────────────────────────────────────────────────────

  async postCollection(input: CollectionInput): Promise<VanDocument> {
    const { customer } = input;
    const receiptId = this.docs.nextNumber('receipt');
    const mobileTransId = uuidV4();
    const cheques = input.method === 'PDC' ? input.cheques ?? [] : [];

    this.outbox.enqueue({
      apiNo: 29,
      label: 'Collections',
      mobileTransId,
      body: {
        ReceiptId: receiptId,
        CustAccount: customer.id,
        Amount: round2(input.amount),
        PaymentMethod: input.method,
        WalletRef: input.method === 'E_WALLET' ? input.walletRef ?? '' : undefined,
        Settlement: input.settlement.map((s) => ({ InvoiceId: s.invoiceId, Amount: s.amount })),
      },
    });

    const stored: Cheque[] = [];
    if (cheques.length) {
      this.outbox.enqueue({
        apiNo: 30,
        label: 'Cheques',
        dependsOn: [mobileTransId],
        body: {
          ReceiptId: receiptId,
          CustAccount: customer.id,
          Total: round2(cheques.reduce((s, c) => s + c.amount, 0)),
          Cheques: cheques.map((c) => ({ ChequeNum: c.number, Bank: c.bank, MaturityDate: c.dueDate, Amount: c.amount })),
        },
      });
      for (const c of cheques) {
        const { photoDataUrl, ...cheque } = c;
        let photoId = cheque.photoId;
        if (photoDataUrl) {
          photoId = await this.attachments.save(photoDataUrl);
          this.outbox.enqueue({
            apiNo: 38,
            label: 'Attachments',
            dependsOn: [mobileTransId],
            body: { AttachmentId: photoId, ParentDocumentId: receiptId, Kind: 'CHEQUE', FileName: `${receiptId}-${c.number}.jpg` },
          });
        }
        stored.push({ ...cheque, photoId });
      }
      const at = new Date().toISOString();
      this.docs.addCheques(
        stored.map<ChequeRecord>((c) => ({
          ...c,
          receiptId,
          customerId: customer.id,
          status: 'WITH_REP',
          history: [{ status: 'WITH_REP', at }],
        }))
      );
    }

    this.store.patchCustomer(customer.id, (c) => ({ ...c, openInvoices: applySettlement(c.openInvoices, input.settlement) }));

    const doc: VanDocument = {
      id: receiptId,
      type: 'RECEIPT',
      customerId: customer.id,
      customerName: customer.name,
      createdAt: new Date().toISOString(),
      lines: [],
      gross: input.amount,
      discounts: 0,
      net: input.amount,
      vat: 0,
      total: round2(input.amount),
      paymentMethod: input.method,
      walletRef: input.walletRef,
      cheques: stored,
      settlement: input.settlement,
      eDocStatus: 'NOT_REQUIRED',
      mobileTransId,
    };
    this.docs.add(doc);
    this.day.recordActivity(customer.id, {
      outcome: 'Collected',
      collected: input.amount,
      balance: this.store.balanceOf(customer.id),
    });
    return doc;
  }

  // ── Visit, survey, customer ──────────────────────────────────────────────

  logVisit(event: VisitEvent, customerId: string, extra: Record<string, unknown> = {}): void {
    this.outbox.enqueue({
      apiNo: 36,
      label: 'Visit log',
      body: {
        Event: event,
        CustAccount: customerId,
        RepId: this.store.repSetup()?.repId,
        RouteId: this.store.repSetup()?.routeId,
        At: new Date().toISOString(),
        ...extra,
      },
    });
  }

  async submitSurvey(
    customerId: string,
    survey: SurveyDefinition,
    answers: SurveyAnswer[],
    photos: { questionId: string; dataUrl: string; takenAt?: string }[],
    position: Position | null
  ): Promise<void> {
    const mobileTransId = uuidV4();
    const takenAt = new Date().toISOString();
    const saved = await Promise.all(photos.map(async (p) => ({ ...p, id: await this.attachments.save(p.dataUrl) })));
    const withIds = answers.map((a) => ({
      ...a,
      photoIds: saved.filter((p) => p.questionId === a.questionId).map((p) => p.id),
    }));
    this.outbox.enqueue({
      apiNo: 37,
      label: 'Surveys',
      mobileTransId,
      body: {
        SurveyId: survey.id,
        CustAccount: customerId,
        Answers: withIds.map((a) => ({ QuestionId: a.questionId, Value: a.value, PhotoIds: a.photoIds })),
        Lat: position?.lat ?? null,
        Lon: position?.lng ?? null,
        At: takenAt,
      },
    });
    for (const p of saved) {
      this.outbox.enqueue({
        apiNo: 38,
        label: 'Attachments',
        dependsOn: [mobileTransId],
        body: {
          AttachmentId: p.id,
          ParentDocumentId: mobileTransId,
          Kind: 'SURVEY_PHOTO',
          QuestionId: p.questionId,
          Lat: position?.lat ?? null,
          Lon: position?.lng ?? null,
          TakenAt: p.takenAt ?? takenAt,
          FileName: `${survey.id}-${p.questionId}.jpg`,
        },
      });
    }
    this.store.mutateLocal((d) => ({ ...d, surveyed: [...new Set([...d.surveyed, customerId])] }));
    this.day.recordActivity(customerId, { outcome: 'Surveyed' });
  }

  submitCustomerRequest(body: Record<string, unknown>): string {
    const requestId = `CR-${localIsoDate().replace(/-/g, '')}-${uuidV4().slice(0, 4).toUpperCase()}`;
    this.outbox.enqueue({ apiNo: 35, label: 'Customer requests', body: { RequestId: requestId, ...body } });
    this.day.addCustomerRequest();
    return requestId;
  }

  /** Online refresh of one customer's balance, credit flags and points (#18, #19, #22). */
  async refreshCustomer(customerId: string): Promise<void> {
    if (!this.network.online()) return;
    try {
      const { invoices, credit, loyalty } = await firstValueFrom(
        forkJoin({
          invoices: this.api.getOpenInvoices(customerId),
          credit: this.api.checkCredit(customerId),
          loyalty: this.api.getLoyaltyBalance(customerId),
        })
      );
      // Local documents D365 has not seen yet must survive the refresh.
      if (!this.outbox.isEmpty()) return;
      this.store.patchCustomer(customerId, (c) => ({ ...c, ...credit, openInvoices: invoices, loyalty }));
      this.day.recordActivity(customerId, { balance: this.store.balanceOf(customerId) });
    } catch {
      // Cached values stand.
    }
  }

  // ── Van stock ────────────────────────────────────────────────────────────

  requestLoad(lines: VanStockLine[]): string {
    const id = `LR-${uuidV4().slice(0, 6).toUpperCase()}`;
    const rep = this.store.repSetup();
    this.outbox.enqueue({
      apiNo: 31,
      label: 'Load requests',
      body: {
        RequestId: id,
        FromWarehouse: rep?.mainWarehouse,
        ToWarehouse: rep?.vanWarehouse,
        Lines: lines.map((l) => ({ ItemId: l.itemId, Qty: l.qty })),
      },
    });
    this.store.mutateLocal((d) => ({ ...d, loadRequests: [...d.loadRequests, { id, at: new Date().toISOString(), lines }] }));
    return id;
  }

  receiveLoad(transferId: string, lines: VanStockLine[]): void {
    this.outbox.enqueue({
      apiNo: 32,
      label: 'Load receipts',
      body: {
        TransferId: transferId,
        Warehouse: this.store.repSetup()?.vanWarehouse,
        Lines: lines.map((l) => ({ ItemId: l.itemId, Qty: l.qty })),
      },
    });
    for (const l of lines) this.store.adjustStock(l.itemId, l.qty);
    this.store.mutateLocal((d) => ({ ...d, receivedTransfers: [...d.receivedTransfers, transferId] }));
  }

  // ── Day close ────────────────────────────────────────────────────────────

  /** The day's money and stock, for the close screen (spec §7.9). */
  readonly dayTotals = computed(() => {
    const docs = this.docs.todays();
    const sum = (list: VanDocument[]) => round2(list.reduce((s, d) => s + d.total, 0));
    const sales = docs.filter((d) => d.type === 'INVOICE' || d.type === 'DELIVERY');
    const receipts = docs.filter((d) => d.type === 'RECEIPT');
    const cashSales = sum(sales.filter((d) => d.payMode === 'CASH'));
    const cashCollected = sum(receipts.filter((d) => d.paymentMethod === 'CASH'));
    const cheques = this.docs.chequesInHand();
    return {
      sales: sum(sales),
      orders: sum(docs.filter((d) => d.type === 'ORDER')),
      returns: sum(docs.filter((d) => d.type === 'RETURN')),
      cashExpected: round2(cashSales + cashCollected),
      walletCollected: sum(receipts.filter((d) => d.paymentMethod === 'E_WALLET')),
      chequeCount: cheques.length,
      chequeTotal: round2(cheques.reduce((s, c) => s + c.amount, 0)),
      documents: docs.length,
    };
  });

  /**
   * Closes the day: unloads everything left on the van (sellable to the main
   * warehouse, damaged to quarantine), posts the day close, hands the cheques
   * to treasury and locks the visit actions. Refuses while the outbox holds
   * unsent work — the close must be the last document of the day.
   */
  closeDay(cashCounted: number): void {
    if (!this.outbox.isEmpty()) throw new Error('Sync the outbox before closing the day.');
    const rep = this.store.repSetup();
    const local = this.store.local();
    const sellable = this.store.vanStock().filter((s) => s.qty > 0);
    const totals = this.dayTotals();
    const kpi = this.day.kpi();

    const unloadId = uuidV4();
    this.outbox.enqueue({
      apiNo: 33,
      label: 'Van unload',
      mobileTransId: unloadId,
      body: {
        UnloadId: `UL-${localIsoDate().replace(/-/g, '')}-${rep?.repId ?? ''}`,
        FromWarehouse: rep?.vanWarehouse,
        ToWarehouse: rep?.mainWarehouse,
        Lines: sellable.map((s) => ({ ItemId: s.itemId, Qty: s.qty })),
        DamagedLines: local.damaged.map((s) => ({ ItemId: s.itemId, Qty: s.qty, Disposition: 'QUARANTINE' })),
      },
    });
    this.outbox.enqueue({
      apiNo: 41,
      label: 'Day close',
      dependsOn: [unloadId],
      body: {
        DayCloseId: `DC-${localIsoDate().replace(/-/g, '')}-${rep?.repId ?? ''}`,
        RepId: rep?.repId,
        RouteId: rep?.routeId,
        CashCounted: cashCounted,
        CashExpected: totals.cashExpected,
        ChequeCount: totals.chequeCount,
        ChequeTotal: totals.chequeTotal,
        Sales: totals.sales,
        Returns: totals.returns,
        Planned: kpi?.planned ?? 0,
        Visited: kpi?.visited ?? 0,
      },
    });

    for (const s of sellable) this.store.adjustStock(s.itemId, -s.qty);
    this.docs.setChequeStatus((c) => c.status === 'WITH_REP', 'HANDED_TO_TREASURY');
    this.approvals.expireAll();
    this.store.mutateLocal((d) => ({
      ...d,
      damaged: [],
      dayClosed: true,
      closedAt: new Date().toISOString(),
      cashCounted,
    }));
    this.day.closeDay();
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** B2C documents go to ETA through the middleware (#43) once the parent posts. */
  private queueTaxFollowUps(
    parentTransId: string,
    kind: ReturnType<typeof taxDocKindFor>,
    etaUuid: string,
    number: string,
    receiptType: 'Sale' | 'Return',
    total: number
  ): void {
    if (kind !== 'E_RECEIPT' && kind !== 'E_RECEIPT_RETURN') return;
    this.outbox.enqueue({
      apiNo: 43,
      label: 'E-receipts',
      dependsOn: [parentTransId],
      body: {
        uuid: etaUuid,
        posSerial: this.store.repSetup()?.deviceSerial,
        receiptNumber: number,
        receiptType,
        buyerType: 'P',
        totalAmount: total,
        dateTimeIssued: new Date().toISOString(),
      },
    });
  }

  private documentLines(pricing: PricingResult): DocumentLine[] {
    return pricing.lines.map((l) => ({
      itemId: l.itemId,
      name: this.store.productName(l.itemId),
      qty: l.qty,
      freeQty: l.freeQty,
      unitPrice: l.unitPrice,
      lineDiscount: l.lineDiscount,
      net: l.net,
      promoLabel: l.freeItemId ? `${l.promoLabel ?? ''} (${this.store.productName(l.freeItemId)})`.trim() : l.promoLabel,
    }));
  }

  private reason(code: string): ReturnReason {
    const r = this.store.reasons().find((x) => x.code === code);
    if (!r) throw new Error(`Unknown return reason ${code}.`);
    return r;
  }
}
