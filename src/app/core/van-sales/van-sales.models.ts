// ── Van Sales & Distribution — domain model ────────────────────────────────
// The types behind VAN_SALES_UPDATE_SPEC.md §4, plus the master-data shapes the
// spec references by API number but does not spell out. Everything the device
// caches or queues is one of these; the HTTP adapter maps D365 rows onto them
// and the mock adapter seeds them directly.
//
// The older `models/van-journey.model.ts` still owns the day's route (`VanDay`,
// `VanVisit`). A visit points at a customer here by account number.

export type Role = 'VAN_SELLER' | 'PRE_SELLER' | 'DELIVERY_REP' | 'COLLECTOR' | 'SUPERVISOR';
export type PayMode = 'CASH' | 'CREDIT';
export type TaxDocKind = 'E_INVOICE' | 'E_RECEIPT' | 'E_CREDIT_NOTE' | 'E_RECEIPT_RETURN';

/** Everything a role can be allowed to do. Checked through `VanRoleService.can`. */
export type VanAction =
  | 'SELL'
  | 'TAKE_ORDER'
  | 'DELIVER'
  | 'COLLECT'
  | 'RETURN'
  | 'FREE_RETURN'
  | 'SURVEY'
  | 'NO_SALE'
  | 'NEW_CUSTOMER'
  | 'VAN_STOCK'
  | 'DAY_CLOSE'
  | 'APPROVE'
  /** See a customer's balance, credit limit and open invoice amounts. */
  | 'VIEW_BALANCE'
  /** Create and edit survey definitions. */
  | 'MANAGE_SURVEYS';

/** API #12 — who this rep is, and the limits their company set for them. */
export interface RepSetup {
  repId: string;
  workerName: string;
  role: Role;
  vanWarehouse: string;
  mainWarehouse: string;
  routeId: string;
  supervisorId: string;
  manualDiscountLimitPct: number;
  /** Including VAT. */
  freeReturnLimitPerVisit: number;
  geofenceRadiusM: number;
  /**
   * Whether check-in must happen inside `geofenceRadiusM`. Off: location is
   * optional — recorded when the device has a fix, never a reason to refuse.
   */
  geofenceRequired?: boolean;
  /** ETA POS serial the e-receipts are issued under. */
  deviceSerial: string;
  docNumberSeqPrefix: { invoice: string; order: string; return: string; receipt: string };
  /** Whether a delivery rep may also raise new orders (spec §3). */
  deliveryCanTakeOrders?: boolean;
  currency: string;
}

export interface OpenInvoice {
  invoiceId: string;
  date: string;
  dueDate?: string;
  /** Remaining, not original. Negative for a credit note. */
  amount: number;
}

/** API #1, #2, #18, #19, #22 merged into what a visit needs. */
export interface Customer {
  id: string;
  name: string;
  address: string;
  lat?: number;
  lon?: number;
  priceGroup: string;
  /** Present → E-Invoice (B2B); absent → E-Receipt (B2C). */
  taxId?: string;
  paymentTerms: PayMode;
  creditLimit: number;
  overdue: boolean;
  /** Set by a bounced cheque or finance. Blocks credit sales. */
  creditHold: boolean;
  holdReason?: string;
  openInvoices: OpenInvoice[];
  loyalty?: { points: number; tier: string };
}

export interface JourneyStop {
  customerId: string;
  sequence: number;
  eta?: string;
  windowFrom?: string;
  windowTo?: string;
  priority?: 'HIGH' | 'NORMAL';
}

/** API #5, #6, #7. */
export interface Product {
  itemId: string;
  name: string;
  unit: string;
  /** Pieces per carton — the "+ctn" stepper adds this many. */
  cartonQty: number;
  barcode?: string;
  /** List price before the customer's price group. */
  basePrice: number;
  taxGroup: string;
}

/** API #8 — a price for an item in a customer price group. */
export interface PriceAgreement {
  itemId: string;
  priceGroup: string;
  unitPrice: number;
}

/** API #9. */
export interface TaxGroup {
  code: string;
  ratePct: number;
}

export type Disposition = 'RESTOCK' | 'QUARANTINE' | 'SCRAP';

/** API #10. `sellable` decides whether stock goes back on the van. */
export interface ReturnReason {
  code: string;
  description: string;
  disposition: Disposition;
  sellable: boolean;
}

export interface PromotionRule {
  id: string;
  name: string;
  type: 'LINE_TIER' | 'FOC' | 'MIX_MATCH' | 'INVOICE_THRESHOLD';
  validFrom: string;
  validTo: string;
  customerGroups?: string[];
  itemIds?: string[];
  minQty?: number;
  discountPct?: number;
  buyQty?: number;
  freeQty?: number;
  freeItemId?: string;
  minEachQty?: number;
  minNetAmount?: number;
  /** Money left in the promotion's budget. Absent means unlimited. */
  budgetRemaining?: number;
}

/** API #16. */
export interface LoyaltyRules {
  /** Points earned per currency unit of net sale. */
  earnPerUnit: number;
  /** Currency value of one redeemed point. */
  redeemValuePerPoint: number;
  minRedeemPoints: number;
  tiers: { name: string; minPoints: number }[];
}

/**
 * API #15 — survey definitions, built by a supervisor in the survey builder and
 * pulled to every van. Nothing about a survey is fixed in the app: the
 * questions, their order, types, options and the conditions that show them
 * all come from the definition.
 */
export type SurveyQuestionType = 'YES_NO' | 'CHOICE' | 'MULTI_CHOICE' | 'NUMBER' | 'RATING' | 'TEXT' | 'PHOTO';

export interface SurveyQuestion {
  id: string;
  text: string;
  type: SurveyQuestionType;
  required: boolean;
  /** Short guidance shown under the question. */
  help?: string;
  /** CHOICE and MULTI_CHOICE. */
  options?: string[];
  /** NUMBER: allowed range. RATING: scale top (defaults to 5). */
  min?: number;
  max?: number;
  /**
   * Ask this question only when an earlier question was answered with
   * `equals` (for YES_NO use 'Yes' or 'No'; for MULTI_CHOICE, when it was one
   * of the picks).
   */
  showIf?: { questionId: string; equals: string };
}

export interface SurveyDefinition {
  id: string;
  name: string;
  description?: string;
  /** Inactive surveys stay in the builder but are not offered in the field. */
  active?: boolean;
  /** Price groups it is for; empty means every customer. */
  customerGroups?: string[];
  validFrom?: string;
  validTo?: string;
  questions: SurveyQuestion[];
  updatedAt?: string;
}

export interface SurveyAnswer {
  questionId: string;
  value: string | number | boolean | string[] | null;
  /** For PHOTO questions: attachment ids in the local attachment store. */
  photoIds?: string[];
}

/** API #20 — what is physically on the van. */
export interface VanStockLine {
  itemId: string;
  qty: number;
}

// ── Pricing ────────────────────────────────────────────────────────────────

export interface CartLine {
  itemId: string;
  qty: number;
  unit: string;
}

export interface PricedLine {
  itemId: string;
  qty: number;
  freeQty: number;
  /** Where free goods land when they are a different item. */
  freeItemId?: string;
  unitPrice: number;
  gross: number;
  lineDiscount: number;
  net: number;
  vat: number;
  promoIds: string[];
  promoLabel?: string;
}

export interface PricingResult {
  lines: PricedLine[];
  gross: number;
  lineDiscount: number;
  invoiceDiscount: number;
  manualDiscountPct: number;
  manualDiscount: number;
  redeemedPoints: number;
  redeemedValue: number;
  net: number;
  vat: number;
  total: number;
  pointsToEarn: number;
  appliedPromoIds: string[];
  /** Free units by item — what the van must also give up. */
  freeGoods: { itemId: string; qty: number }[];
}

// ── Money in ───────────────────────────────────────────────────────────────

export type PaymentMethod = 'CASH' | 'PDC' | 'E_WALLET';

export interface Cheque {
  bank: string;
  number: string;
  dueDate: string;
  amount: number;
  /** Attachment id of the photo in the local store. */
  photoId?: string;
}

export type ChequeStatus = 'WITH_REP' | 'HANDED_TO_TREASURY' | 'DEPOSITED' | 'CLEARED' | 'BOUNCED';

export interface ChequeRecord extends Cheque {
  receiptId: string;
  customerId: string;
  status: ChequeStatus;
  history: { status: ChequeStatus; at: string }[];
}

export interface SettlementLine {
  invoiceId: string;
  date: string;
  open: number;
  applied: number;
  partial: boolean;
}

// ── Approvals ──────────────────────────────────────────────────────────────

export type ApprovalType = 'EXTRA_DISCOUNT' | 'CREDIT_OVERRIDE' | 'FREE_RETURN' | 'GEOFENCE_OVERRIDE';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ApprovalRequest {
  id: string;
  type: ApprovalType;
  customerId: string;
  customerName?: string;
  repId: string;
  detail: string;
  payload: unknown;
  status: ApprovalStatus;
  createdAt: string;
  decidedAt?: string;
}

// ── Orders & delivery ──────────────────────────────────────────────────────

export type SalesOrderStatus = 'READY' | 'DELIVERED' | 'PARTIALLY_DELIVERED' | 'REJECTED';

export interface SalesOrderLine {
  itemId: string;
  qty: number;
  freeQty: number;
  unitPrice: number;
  lineDiscount: number;
}

/** A pre-sold order waiting on the van (API #21 for history, #24 creates). */
export interface SalesOrder {
  salesId: string;
  customerId: string;
  createdAt: string;
  requestedShipDate: string;
  payMode: PayMode;
  lines: SalesOrderLine[];
  total: number;
  status: SalesOrderStatus;
  /** Created on this device today, rather than pulled from D365. */
  local?: boolean;
}

// ── Documents ──────────────────────────────────────────────────────────────

export type VanDocType = 'INVOICE' | 'ORDER' | 'RETURN' | 'RECEIPT' | 'DELIVERY';
export type EDocStatus = 'QUEUED' | 'SUBMITTED' | 'VALID' | 'REJECTED' | 'NOT_REQUIRED';

export interface DocumentLine {
  itemId: string;
  name: string;
  qty: number;
  freeQty: number;
  unitPrice: number;
  lineDiscount: number;
  net: number;
  promoLabel?: string;
}

/**
 * Anything the rep hands a customer a paper copy of. Stored locally so the
 * receipt screen can re-open and re-print it after the fact.
 */
export interface VanDocument {
  id: string;
  type: VanDocType;
  customerId: string;
  customerName: string;
  createdAt: string;
  payMode?: PayMode;
  lines: DocumentLine[];
  gross: number;
  discounts: number;
  net: number;
  vat: number;
  total: number;
  pointsEarned?: number;
  pointsRedeemed?: number;
  /** Collection receipts: method, cheques and settlement. */
  paymentMethod?: PaymentMethod;
  walletRef?: string;
  cheques?: Cheque[];
  settlement?: { invoiceId: string; amount: number }[];
  /** Returns. */
  reasonCode?: string;
  reasonText?: string;
  disposition?: Disposition;
  originalInvoice?: string;
  /** Deliveries. */
  salesId?: string;
  rejectReason?: string;
  signatureId?: string;
  /** Tax document. */
  taxDocKind?: TaxDocKind;
  etaUuid?: string;
  eDocStatus: EDocStatus;
  /** QR payload as returned by the middleware. Never invented on the device. */
  qrPayload?: string;
  mobileTransId: string;
}

// ── Outbox ─────────────────────────────────────────────────────────────────

export type OutboxStatus = 'QUEUED' | 'SENDING' | 'POSTED' | 'FAILED';

export interface OutboxItem {
  /** UUID v4, generated once, never regenerated. */
  mobileTransId: string;
  apiNo: number;
  endpoint: string;
  /** Human label for the day-close list. */
  label: string;
  body: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
  nextAttemptAt?: string;
  status: OutboxStatus;
  d365DocumentId?: string;
  /** `mobileTransId`s that must be POSTED before this one is sent. */
  dependsOn?: string[];
}

/** The standard response envelope for custom services (spec §6.1). */
export interface ServiceEnvelope<T = unknown> {
  Success: boolean;
  Message: string;
  MobileTransId: string;
  DocumentId?: string;
  Duplicate: boolean;
  Data?: T;
}

/** Everything pulled at sign-in and on Refresh, cached for offline use. */
export interface MasterData {
  repSetup: RepSetup;
  customers: Customer[];
  journey: JourneyStop[];
  products: Product[];
  prices: PriceAgreement[];
  taxGroups: TaxGroup[];
  reasons: ReturnReason[];
  promotions: PromotionRule[];
  surveys: SurveyDefinition[];
  loyalty: LoyaltyRules;
  banks: string[];
  vanStock: VanStockLine[];
  orders: SalesOrder[];
  /** Last purchase price per customer + item, for free returns. */
  lastPrices: { customerId: string; itemId: string; price: number }[];
  /** Base-price multiplier per price group where no agreement exists. */
  priceGroupFactors: Record<string, number>;
  pulledAt: string;
}
