import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { VanApiNo } from './van-sales-endpoints';
import {
  ApprovalRequest,
  ApprovalStatus,
  ChequeRecord,
  ChequeStatus,
  Customer,
  EDocStatus,
  JourneyStop,
  LoyaltyRules,
  OpenInvoice,
  PriceAgreement,
  Product,
  PromotionRule,
  RepSetup,
  ReturnReason,
  SalesOrder,
  ServiceEnvelope,
  SurveyDefinition,
  TaxGroup,
  VanStockLine,
} from './van-sales.models';

/**
 * The Van Sales backend, as the device sees it (spec §6.4).
 *
 * Two implementations: `VanSalesHttpApi` (D365 through the portal's `/d365`
 * pass-through) and `VanSalesMockApi` (in memory, seeded with the simulation).
 * `VanSalesApiRouter` picks one per call from `environment.vanSalesApi` and
 * `vanSalesMockEndpoints`, so the real services can be switched on one API
 * number at a time as the X++ side is delivered.
 *
 * Reads return domain models; every write goes through `post`, which the
 * outbox calls, and answers with the standard envelope.
 */
export interface VanSalesApi {
  // Pull (cached for offline) — §5
  getRepSetup(): Observable<RepSetup>;
  getJourney(routeId: string): Observable<JourneyStop[]>;
  getCustomers(routeId: string): Observable<Customer[]>;
  getProducts(): Observable<Product[]>;
  getPrices(): Observable<PriceAgreement[]>;
  getTaxGroups(): Observable<TaxGroup[]>;
  getReturnReasons(): Observable<ReturnReason[]>;
  getPromotions(): Observable<PromotionRule[]>;
  getSurveys(): Observable<SurveyDefinition[]>;
  getLoyaltyRules(): Observable<LoyaltyRules>;
  getBanks(): Observable<string[]>;
  getVanStock(warehouse: string): Observable<VanStockLine[]>;
  getOrders(routeId: string): Observable<SalesOrder[]>;
  getLastPrices(routeId: string): Observable<{ customerId: string; itemId: string; price: number }[]>;

  // Online — fall back to cache when they fail
  getOpenInvoices(customerId: string): Observable<OpenInvoice[]>;
  checkCredit(customerId: string): Observable<Pick<Customer, 'creditLimit' | 'overdue' | 'creditHold' | 'holdReason'>>;
  getLoyaltyBalance(customerId: string): Observable<{ points: number; tier: string }>;
  calculatePrice(body: unknown): Observable<{ net: number; vat: number; total: number }>;

  // Queue — every write, called by the outbox
  post(apiNo: VanApiNo, body: Record<string, unknown>): Observable<ServiceEnvelope>;

  // Supervisor
  listApprovals(): Observable<ApprovalRequest[]>;
  decideApproval(id: string, status: Exclude<ApprovalStatus, 'PENDING'>): Observable<ApprovalRequest>;
  listCheques(): Observable<ChequeRecord[]>;
  updateChequeStatus(receiptId: string, number: string, bank: string, status: ChequeStatus): Observable<ChequeRecord>;
  getEDocStatus(uuids: string[]): Observable<{ uuid: string; status: EDocStatus; qrPayload?: string }[]>;

  // Survey builder — definitions are server state, so these go online, not through the outbox.
  saveSurvey(def: SurveyDefinition): Observable<SurveyDefinition>;
  deleteSurvey(id: string): Observable<void>;
}

export const VAN_SALES_HTTP_API = new InjectionToken<VanSalesApi>('VanSalesHttpApi');
export const VAN_SALES_MOCK_API = new InjectionToken<VanSalesApi>('VanSalesMockApi');

/** Raised by an adapter when the backend answered `Success: false` — not worth retrying. */
export class VanBusinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VanBusinessError';
  }
}
