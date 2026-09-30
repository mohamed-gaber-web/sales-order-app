import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, throwError } from 'rxjs';
import { VAN_SALES_CONFIG } from './van-sales.config';
import { ApiService } from '../services/api.service';
import { ODataResponse } from '../models/lookup.models';
import { VanBusinessError, VanSalesApi } from './van-sales-api';
import { VAN_ENDPOINTS, VanApiNo, wrapBody } from './van-sales-endpoints';
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

type Row = Record<string, unknown>;

/**
 * The real backend: D365 F&O through the admin portal's `/d365` pass-through.
 *
 * The standard entities (#1–#11, #20, #21) exist today. The `VS*` entities and
 * `VSServices` operations are being built by the backend team; until one is
 * deployed, keep its API number in `environment.vanSalesMockEndpoints`.
 *
 * Column names on the custom entities follow the spec's request bodies and
 * must be checked against `/data/$metadata` when each one lands. Every mapping
 * is in this file, so a renamed column is a one-line change.
 */
@Injectable({ providedIn: 'root' })
export class VanSalesHttpApi implements VanSalesApi {
  private readonly api = inject(ApiService);

  // ── Pull ────────────────────────────────────────────────────────────────

  getRepSetup(): Observable<RepSetup> {
    return this.rows(12, { $top: '1' }).pipe(
      map(([r]) => {
        if (!r) throw new VanBusinessError('No rep setup for this user. Ask your supervisor to assign a van.');
        return {
          repId: s(r['RepId']),
          workerName: s(r['WorkerName']),
          role: s(r['Role']) as RepSetup['role'],
          vanWarehouse: s(r['VanWarehouse']),
          mainWarehouse: s(r['MainWarehouse']),
          routeId: s(r['RouteId']),
          supervisorId: s(r['SupervisorId']),
          manualDiscountLimitPct: n(r['ManualDiscountLimitPct'], 3),
          freeReturnLimitPerVisit: n(r['FreeReturnLimitPerVisit'], 1000),
          geofenceRadiusM: n(r['GeofenceRadiusM'], 100),
          geofenceRequired: r['GeofenceRequired'] === 'Yes' || r['GeofenceRequired'] === true,
          deviceSerial: s(r['DeviceSerial']),
          docNumberSeqPrefix: {
            invoice: s(r['InvoicePrefix']),
            order: s(r['OrderPrefix']),
            return: s(r['ReturnPrefix']),
            receipt: s(r['ReceiptPrefix']),
          },
          deliveryCanTakeOrders: r['DeliveryCanTakeOrders'] === 'Yes' || r['DeliveryCanTakeOrders'] === true,
          currency: s(r['CurrencyCode']) || 'EGP',
        };
      })
    );
  }

  getJourney(routeId: string): Observable<JourneyStop[]> {
    return this.rows(13, { $filter: `RouteId eq '${esc(routeId)}'`, $orderby: 'Sequence' }).pipe(
      map((rows) =>
        rows.map((r) => ({
          customerId: s(r['CustAccount']),
          sequence: n(r['Sequence']),
          eta: s(r['Eta']) || undefined,
          windowFrom: s(r['WindowFrom']) || undefined,
          windowTo: s(r['WindowTo']) || undefined,
          priority: r['Priority'] === 'High' ? 'HIGH' : 'NORMAL',
        }))
      )
    );
  }

  getCustomers(routeId: string): Observable<Customer[]> {
    // Route customers come from the journey entity; the customer master adds
    // the commercial fields. Open invoices are loaded per visit (#18).
    return this.rows(1, {
      $filter: `VSRouteId eq '${esc(routeId)}'`,
      $select:
        'CustomerAccount,OrganizationName,AddressDescription,AddressLatitude,AddressLongitude,' +
        'CustomerGroupId,SalesTaxGroup,TaxExemptNumber,PaymentTerms,CreditLimit,CreditLimitIsMandatory,OnHoldStatus',
    }).pipe(
      map((rows) =>
        rows.map((r) => ({
          id: s(r['CustomerAccount']),
          name: s(r['OrganizationName']),
          address: s(r['AddressDescription']),
          lat: n(r['AddressLatitude']) || undefined,
          lon: n(r['AddressLongitude']) || undefined,
          priceGroup: s(r['CustomerGroupId']),
          taxId: s(r['TaxExemptNumber']) || undefined,
          paymentTerms: /cash|cod/i.test(s(r['PaymentTerms'])) ? 'CASH' : 'CREDIT',
          creditLimit: n(r['CreditLimit']),
          overdue: false,
          creditHold: !!r['OnHoldStatus'] && r['OnHoldStatus'] !== 'No',
          openInvoices: [],
        }))
      )
    );
  }

  getProducts(): Observable<Product[]> {
    return this.rows(5, {
      $select: 'ItemNumber,SearchName,ProductName,SalesUnitSymbol,SalesPrice,SalesSalesTaxItemGroupCode,VSCartonQty,VSBarcode',
    }).pipe(
      map((rows) =>
        rows.map((r) => ({
          itemId: s(r['ItemNumber']),
          name: s(r['ProductName']) || s(r['SearchName']),
          unit: s(r['SalesUnitSymbol']) || 'pcs',
          cartonQty: n(r['VSCartonQty'], 1),
          barcode: s(r['VSBarcode']) || undefined,
          basePrice: n(r['SalesPrice']),
          taxGroup: s(r['SalesSalesTaxItemGroupCode']),
        }))
      )
    );
  }

  getPrices(): Observable<PriceAgreement[]> {
    return this.rows(8, { $select: 'ItemNumber,PriceCustomerGroupCode,Price' }).pipe(
      map((rows) =>
        rows.map((r) => ({ itemId: s(r['ItemNumber']), priceGroup: s(r['PriceCustomerGroupCode']), unitPrice: n(r['Price']) }))
      )
    );
  }

  getTaxGroups(): Observable<TaxGroup[]> {
    return this.rows(9, {}).pipe(
      map((rows) => rows.map((r) => ({ code: s(r['TaxItemGroup'] ?? r['TaxGroupCode']), ratePct: n(r['TaxRate'] ?? r['Rate']) })))
    );
  }

  getReturnReasons(): Observable<ReturnReason[]> {
    return this.rows(10, {}).pipe(
      map((rows) =>
        rows.map((r) => {
          const disposition = (s(r['VSDisposition']) || 'QUARANTINE').toUpperCase() as ReturnReason['disposition'];
          return {
            code: s(r['ReturnReasonCode'] ?? r['ReasonCode']),
            description: s(r['Description']),
            disposition,
            sellable: r['VSSellable'] === 'Yes' || r['VSSellable'] === true,
          };
        })
      )
    );
  }

  getPromotions(): Observable<PromotionRule[]> {
    return this.rows(14, {}).pipe(
      map((rows) =>
        rows.map((r) => ({
          id: s(r['PromotionId']),
          name: s(r['Name']),
          type: s(r['Type']) as PromotionRule['type'],
          validFrom: s(r['ValidFrom']).slice(0, 10),
          validTo: s(r['ValidTo']).slice(0, 10),
          customerGroups: list(r['CustomerGroups']),
          itemIds: list(r['ItemIds']),
          minQty: opt(r['MinQty']),
          discountPct: opt(r['DiscountPct']),
          buyQty: opt(r['BuyQty']),
          freeQty: opt(r['FreeQty']),
          freeItemId: s(r['FreeItemId']) || undefined,
          minEachQty: opt(r['MinEachQty']),
          minNetAmount: opt(r['MinNetAmount']),
          budgetRemaining: opt(r['BudgetRemaining']),
        }))
      )
    );
  }

  getSurveys(): Observable<SurveyDefinition[]> {
    return this.rows(15, {}).pipe(
      map((rows) =>
        rows.map((r) => ({
          id: s(r['SurveyId']),
          name: s(r['Name']),
          description: s(r['Description']) || undefined,
          active: r['Active'] === undefined ? true : r['Active'] === 'Yes' || r['Active'] === true,
          customerGroups: list(r['CustomerGroups']),
          validFrom: s(r['ValidFrom']).slice(0, 10) || undefined,
          validTo: s(r['ValidTo']).slice(0, 10) || undefined,
          questions: parseJson(r['QuestionsJson'], []),
          updatedAt: s(r['ModifiedDateTime']) || undefined,
        }))
      )
    );
  }

  /**
   * Upserts a survey on `VSSurveys`. The questions travel as one JSON column,
   * so the backend needs no child entity — and a new question type needs no
   * schema change. Key shape to confirm against `$metadata`.
   */
  saveSurvey(def: SurveyDefinition): Observable<SurveyDefinition> {
    const row = {
      SurveyId: def.id,
      Name: def.name,
      Description: def.description ?? '',
      Active: def.active === false ? 'No' : 'Yes',
      CustomerGroups: (def.customerGroups ?? []).join(';'),
      ValidFrom: def.validFrom ?? null,
      ValidTo: def.validTo ?? null,
      QuestionsJson: JSON.stringify(def.questions),
    };
    return this.api
      .patch<unknown>(`${VAN_ENDPOINTS[15]}(SurveyId='${esc(def.id)}')`, row)
      .pipe(
        catchError((e: { status?: number }) => (e?.status === 404 ? this.api.post<unknown>(VAN_ENDPOINTS[15], row) : throwError(() => e))),
        map(() => ({ ...def, updatedAt: new Date().toISOString() }))
      );
  }

  deleteSurvey(id: string): Observable<void> {
    return this.api.delete<void>(`${VAN_ENDPOINTS[15]}(SurveyId='${esc(id)}')`);
  }

  getLoyaltyRules(): Observable<LoyaltyRules> {
    return this.rows(16, { $top: '1' }).pipe(
      map(([r]) => ({
        earnPerUnit: n(r?.['EarnPerUnit']),
        redeemValuePerPoint: n(r?.['RedeemValuePerPoint']),
        minRedeemPoints: n(r?.['MinRedeemPoints']),
        tiers: parseJson(r?.['TiersJson'], [{ name: 'Standard', minPoints: 0 }]),
      }))
    );
  }

  getBanks(): Observable<string[]> {
    return this.rows(17, {}).pipe(map((rows) => rows.map((r) => s(r['BankName'])).filter(Boolean)));
  }

  getVanStock(warehouse: string): Observable<VanStockLine[]> {
    return this.rows(20, {
      $filter: `InventoryWarehouseId eq '${esc(warehouse)}'`,
      $select: 'ItemNumber,AvailableOnHandQuantity',
    }).pipe(map((rows) => rows.map((r) => ({ itemId: s(r['ItemNumber']), qty: n(r['AvailableOnHandQuantity']) }))));
  }

  getOrders(routeId: string): Observable<SalesOrder[]> {
    return this.rows(21, {
      $filter: `VSRouteId eq '${esc(routeId)}' and SalesOrderStatus eq Microsoft.Dynamics.DataEntities.SalesStatus'Backorder'`,
      $expand: 'SalesOrderLines($select=ItemNumber,OrderedSalesQuantity,SalesPrice,LineDiscountAmount)',
    }).pipe(
      map((rows) =>
        rows.map((r) => {
          const lines = ((r['SalesOrderLines'] as Row[]) ?? []).map((l) => ({
            itemId: s(l['ItemNumber']),
            qty: n(l['OrderedSalesQuantity']),
            freeQty: 0,
            unitPrice: n(l['SalesPrice']),
            lineDiscount: n(l['LineDiscountAmount']),
          }));
          return {
            salesId: s(r['SalesOrderNumber']),
            customerId: s(r['OrderingCustomerAccountNumber']),
            createdAt: s(r['OrderCreationDateTime']).slice(0, 10),
            requestedShipDate: s(r['RequestedShippingDate']).slice(0, 10),
            payMode: /cash|cod/i.test(s(r['PaymentTermsName'])) ? 'CASH' : 'CREDIT',
            lines,
            total: lines.reduce((sum, l) => sum + l.qty * l.unitPrice - l.lineDiscount, 0),
            status: 'READY',
          } satisfies SalesOrder;
        })
      )
    );
  }

  getLastPrices(routeId: string) {
    return this.service<{ customerId: string; itemId: string; price: number }[]>(
      18,
      { RouteId: routeId, Mode: 'LastPrices' }
    );
  }

  // ── Online ──────────────────────────────────────────────────────────────

  getOpenInvoices(customerId: string): Observable<OpenInvoice[]> {
    return this.service<Row[]>(18, { CustAccount: customerId }).pipe(
      map((rows) =>
        (rows ?? []).map((r) => ({
          invoiceId: s(r['InvoiceId']),
          date: s(r['InvoiceDate']).slice(0, 10),
          dueDate: s(r['DueDate']).slice(0, 10) || undefined,
          amount: n(r['RemainAmount']),
        }))
      )
    );
  }

  checkCredit(customerId: string) {
    return this.service<Row>(19, { CustAccount: customerId }).pipe(
      map((r) => ({
        creditLimit: n(r?.['CreditLimit']),
        overdue: !!r?.['Overdue'],
        creditHold: !!r?.['CreditHold'],
        holdReason: s(r?.['HoldReason']) || undefined,
      }))
    );
  }

  getLoyaltyBalance(customerId: string) {
    return this.service<Row>(22, { CustAccount: customerId }).pipe(
      map((r) => ({ points: n(r?.['Points']), tier: s(r?.['Tier']) }))
    );
  }

  calculatePrice(body: unknown) {
    return this.service<Row>(23, body).pipe(
      map((r) => ({ net: n(r?.['NetAmount']), vat: n(r?.['VAT']), total: n(r?.['Total']) }))
    );
  }

  // ── Queue ───────────────────────────────────────────────────────────────

  post(apiNo: VanApiNo, body: Record<string, unknown>): Observable<ServiceEnvelope> {
    // #43 goes to the ETA middleware, not D365 — the device never calls ETA itself.
    const request$ =
      apiNo === 43
        ? this.api.postWithHeaders<ServiceEnvelope | Row>(VAN_ENDPOINTS[43], body, {}, VAN_SALES_CONFIG.etaMiddlewareBaseUrl)
        : this.api.post<ServiceEnvelope | Row>(VAN_ENDPOINTS[apiNo], wrapBody(apiNo, body));
    return request$.pipe(
      map((res) => {
        const env = res as ServiceEnvelope;
        // An OData insert answers with the row, not the envelope.
        if (env?.Success === undefined) {
          return {
            Success: true,
            Message: '',
            MobileTransId: String(body['MobileTransId'] ?? ''),
            DocumentId: s((res as Row)?.['DocumentId'] ?? (res as Row)?.['RecId']),
            Duplicate: false,
          };
        }
        if (!env.Success) throw new VanBusinessError(env.Message || 'D365 rejected the document.');
        return env;
      })
    );
  }

  // ── Supervisor ──────────────────────────────────────────────────────────

  listApprovals() {
    return this.service<ApprovalRequest[]>(91, {}).pipe(map((r) => r ?? []));
  }

  decideApproval(id: string, status: Exclude<ApprovalStatus, 'PENDING'>) {
    return this.service<ApprovalRequest>(92, { ApprovalId: id, Status: status });
  }

  listCheques() {
    return this.service<ChequeRecord[]>(93, { Mode: 'List' }).pipe(map((r) => r ?? []));
  }

  updateChequeStatus(receiptId: string, number: string, bank: string, status: ChequeStatus) {
    return this.service<ChequeRecord>(93, { ReceiptId: receiptId, ChequeNum: number, Bank: bank, Status: status });
  }

  getEDocStatus(uuids: string[]) {
    return this.api
      .postWithHeaders<{ uuid: string; status: EDocStatus; qrPayload?: string }[]>(
        `${VAN_ENDPOINTS[43]}/status`,
        { uuids },
        {},
        VAN_SALES_CONFIG.etaMiddlewareBaseUrl
      )
      .pipe(map((r) => r ?? []));
  }

  // ── Plumbing ────────────────────────────────────────────────────────────

  private rows(apiNo: VanApiNo, params: Record<string, string>): Observable<Row[]> {
    return this.api
      .get<ODataResponse<Row>>(VAN_ENDPOINTS[apiNo], { 'cross-company': 'true', ...params })
      .pipe(map((res) => res.value ?? []));
  }

  private service<T>(apiNo: VanApiNo, body: unknown): Observable<T> {
    return this.api.post<ServiceEnvelope<T>>(VAN_ENDPOINTS[apiNo], wrapBody(apiNo, body)).pipe(
      map((env) => {
        if (env && env.Success === false) throw new VanBusinessError(env.Message || 'D365 rejected the request.');
        return (env?.Data ?? env) as T;
      })
    );
  }
}

function s(v: unknown): string {
  return v === null || v === undefined ? '' : String(v);
}

function n(v: unknown, fallback = 0): number {
  const x = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(x) ? fallback : x;
}

function opt(v: unknown): number | undefined {
  return v === null || v === undefined || v === '' || v === 0 ? undefined : Number(v);
}

function list(v: unknown): string[] | undefined {
  const parts = s(v).split(/[;,]/).map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : undefined;
}

function parseJson<T>(v: unknown, fallback: T): T {
  try {
    return v ? (JSON.parse(String(v)) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** OData string literal escaping. */
function esc(v: string): string {
  return v.replace(/'/g, "''");
}
