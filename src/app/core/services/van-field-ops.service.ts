import { inject, Injectable } from '@angular/core';
import { delay, Observable, of } from 'rxjs';
import { ApiService } from './api.service';

// ── Request / result shapes (IKK Foods van sales spec §5–7) ─────────────────

export interface CollectionRequest {
  customerAccount: string;
  method: 'Cash' | 'Cheque';
  amount: number;
  /** Per-invoice settlement, oldest first. */
  settle: { invoiceId: string; amount: number }[];
}

export interface CollectionResult {
  status: 'Posted';
  voucher: string;
  newBalance: number;
}

export interface ReturnRequest {
  customerAccount: string;
  /** Mandatory — validated against a real posted invoice by the service. */
  originalInvoiceId: string;
  returnType: 'Full' | 'Partial';
  reasonCode: string;
  disposition: string;
  lines: { itemNumber: string; unit: string; qty: number }[];
}

export interface ReturnResult {
  status: 'Posted';
  creditNoteId: string;
  reversedAmount: number;
  /** Credit note carries its own ZATCA QR. */
  zatcaQrBase64: string;
  fiscalInvoiceNo: string;
}

export interface CustomerRequest {
  name: string;
  phone: string;
  taxRegistrationNumber: string;
  paymentMode: 'Credit' | 'COD';
  customerGroup: string;
  attachmentRefs: string[];
}

export interface CustomerRequestResult {
  requestId: string;
  workflowStatus: 'Submitted';
  /** Null until Finance approves and assigns the account. */
  customerAccount: string | null;
}

export interface DayCloseRequest {
  salespersonId: string;
  journeyId: string;
  cashCounted: number;
}

export interface DayCloseResult {
  status: 'Closed';
  cashVariance: number;
  stockTransfer: string;
  kpis: { planned: number; visited: number; strikeRate: number; adherence: number; sales: number };
}

// ── Customer payment journal (standard OData, not the ISV service) ──────────

/** The company every van sales call still hardcodes. See CLAUDE.md. */
const DATA_AREA_ID = 'usmf';

/** The journal name a customer payment batch is opened under. */
const PAYMENT_JOURNAL_NAME = 'CustPay';

/** What `POST /data/CustomerPaymentJournalHeaders` accepts. */
export interface PaymentJournalHeaderRequest {
  dataAreaId: string;
  JournalName: string;
  Description: string;
}

/** What it returns — the entity echoed back with the batch number D365 assigned. */
export interface PaymentJournalHeader extends PaymentJournalHeaderRequest {
  JournalBatchNumber: string;
}

/** Simulated network latency so the UI's loading states are exercised. */
const SCAFFOLD_LATENCY_MS = 700;

/**
 * The van cycle's write operations that post through the D365 custom service
 * group `GPVanSalesGroup` (spec §3.2, §5–7).
 *
 * These services are part of the ISV model and are **not deployed in this
 * environment yet**, so each method here is a documented scaffold: it returns a
 * representative result after a short delay instead of calling D365. The exact
 * endpoint and request body from the spec are recorded on each method so wiring
 * them up later is a one-function change — swap the `of(...)` for the commented
 * `api.post(...)` and the pages are untouched.
 *
 * The one action that is real today is the sale itself: it does not go through
 * `postInvoice` here but through the existing catalogue → checkout flow, which
 * creates a genuine D365 sales order (see VanSalesService.checkout).
 */
@Injectable({ providedIn: 'root' })
export class VanFieldOpsService {
  private api = inject(ApiService);

  /**
   * Collection + settlement in one transaction.
   *
   * SPEC: POST /api/services/GPVanSalesGroup/GPCollectionService/postPayment
   *   body: { _request: { DataAreaId, DeviceTransactionId, CustomerAccount,
   *                        Method, Amount, Cheque, Settle:[{InvoiceId,Amount}] } }
   *   → maps to CustVendPaymJournal + SpecTransSettlement in F&O.
   */
  postPayment(req: CollectionRequest): Observable<CollectionResult> {
    // return this.api.post<CollectionResult>(
    //   '/api/services/GPVanSalesGroup/GPCollectionService/postPayment',
    //   { _request: { DataAreaId: DATA_AREA_ID, DeviceTransactionId: newGuid(),
    //     CustomerAccount: req.customerAccount, Method: req.method, Amount: req.amount,
    //     Cheque: null, Settle: req.settle.map(s => ({ InvoiceId: s.invoiceId, Amount: s.amount })) } });
    const settled = req.settle.reduce((sum, s) => sum + s.amount, 0);
    return of<CollectionResult>({
      status: 'Posted',
      voucher: 'PAYV-004521',
      newBalance: Math.max(0, settled),
    }).pipe(delay(SCAFFOLD_LATENCY_MS));
  }

  /**
   * Return against the original invoice → credit note (with its own ZATCA QR).
   *
   * SPEC: POST /api/services/GPVanSalesGroup/GPReturnService/postReturn
   *   body: { _request: { DataAreaId, DeviceTransactionId, CustomerAccount,
   *           OriginalInvoiceId, ReturnType, ReasonCode, Disposition, Lines:[...] } }
   *   → Return Order (SalesType=ReturnItem) reversed against the original invoice.
   */
  postReturn(req: ReturnRequest): Observable<ReturnResult> {
    // return this.api.post<ReturnResult>(
    //   '/api/services/GPVanSalesGroup/GPReturnService/postReturn', { _request: {...} });
    const reversed = req.lines.reduce((sum, l) => sum + l.qty, 0);
    return of<ReturnResult>({
      status: 'Posted',
      creditNoteId: 'RCN-004120',
      reversedAmount: reversed,
      zatcaQrBase64: '',
      fiscalInvoiceNo: 'SA-2026-CN-0041',
    }).pipe(delay(SCAFFOLD_LATENCY_MS));
  }

  /**
   * New customer request → D365 workflow to Finance for credit approval.
   *
   * SPEC: POST /api/services/GPVanSalesGroup/GPCustomerRequestService/submit
   *   body: { _request: { NameAr, Phone, TaxRegistrationNumber, PaymentMode,
   *           CustomerGroup, Latitude, Longitude, AttachmentRefs:[...] } }
   *   → creates CustCustomerV3 with CustomerHold=Invoice + submits workflow.
   */
  submitCustomerRequest(req: CustomerRequest): Observable<CustomerRequestResult> {
    // return this.api.post<CustomerRequestResult>(
    //   '/api/services/GPVanSalesGroup/GPCustomerRequestService/submit', { _request: {...} });
    return of<CustomerRequestResult>({
      requestId: 'CR-20260802-031',
      workflowStatus: 'Submitted',
      customerAccount: null,
    }).pipe(delay(SCAFFOLD_LATENCY_MS));
  }

  /**
   * Opens a customer payment journal batch.
   *
   * Unlike every other method on this service this is a **real call, not a
   * scaffold**: `CustomerPaymentJournalHeaders` is a standard D365 OData entity,
   * so it is deployed in this environment where the `GPVanSalesGroup` ISV
   * services are not. It goes through the API's `/d365` proxy like every other
   * ERP read and write.
   *
   * It creates the batch and stops there, which is what was asked for. Worth
   * being clear about the consequence: a header carries no customer, no amount
   * and no settlement — those are `CustomerPaymentJournalLines`. Until lines
   * exist and are posted, no money has moved and no customer balance has
   * changed. What this produces is an empty batch with a number.
   */
  createPaymentJournalHeader(
    description = 'Payment from external system'
  ): Observable<PaymentJournalHeader> {
    const header: PaymentJournalHeaderRequest = {
      dataAreaId: DATA_AREA_ID,
      JournalName: PAYMENT_JOURNAL_NAME,
      Description: description,
    };
    return this.api.post<PaymentJournalHeader>('/data/CustomerPaymentJournalHeaders', header);
  }

  /**
   * End-of-day reconciliation: cash count, van-stock transfer back to the main
   * warehouse, and KPI write.
   *
   * SPEC: POST /api/services/GPVanSalesGroup/GPDayCloseService/close
   *   body: { _request: { SalespersonId, JourneyId, CashCounted } }
   *   → cash journal + InventTransferJournal (VAN → main WH) + GPRouteKpiEntity.
   */
  closeDay(req: DayCloseRequest): Observable<DayCloseResult> {
    // return this.api.post<DayCloseResult>(
    //   '/api/services/GPVanSalesGroup/GPDayCloseService/close', { _request: {...} });
    return of<DayCloseResult>({
      status: 'Closed',
      cashVariance: 0,
      stockTransfer: 'TRF-VAN07-0802',
      kpis: { planned: 12, visited: 11, strikeRate: 82, adherence: 91, sales: 46720 },
    }).pipe(delay(SCAFFOLD_LATENCY_MS));
  }

  /**
   * Visit outcome + GPS check-in/out, feeding route-adherence and strike-rate.
   *
   * SPEC: POST /data/GPVisitLogEntity
   *   body: { dataAreaId, JourneyId, CustomerAccount, Sequence,
   *           CheckInTime, CheckInLat, CheckInLng, Outcome, GeofenceOk }
   */
  logVisit(): Observable<void> {
    // return this.api.post<void>('/data/GPVisitLogEntity', { ... });
    return of(void 0).pipe(delay(200));
  }
}
