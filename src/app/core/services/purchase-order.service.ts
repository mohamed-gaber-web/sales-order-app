import { Injectable, inject } from '@angular/core';
import { catchError, EMPTY, expand, forkJoin, from, map, Observable, of, reduce, switchMap, timeout } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ODataResponse } from '../models/lookup.models';
import {
  PurchaseOrderHeader,
  PurchaseOrderLine,
  ProductReceiptLine,
  CreateProductReceiptRequest,
  CreateProductReceiptResponse,
  RegisterPurchaseOrderRequest,
  RegisterPurchaseOrderResponse,
  ConfirmPurchaseOrderRequest,
  ConfirmPurchaseOrderResponse,
  Vendor,
  CreatePurchaseOrderHeaderDto,
  CreatePurchaseOrderLineDto,
} from '../../models/purchase-order.model';
import { testPurchaseOrderEnv } from '../../../environments/test-purchase-order-env';
import { TenantConfigStore } from '../tenant/tenant-config.store';
import { odataString, prefixFilter } from './odata-filter';

export const PO_PAGE_SIZE = 10;

const VENDOR_PAGE_SIZE = 1000;

// D365 custom-action services (createProductReceipt) can legitimately run slow —
// long enough to give a real slow response a chance, short enough that the loading
// UI doesn't hang forever when D365 stalls.
const PRODUCT_RECEIPT_TIMEOUT_MS = 90_000;

// Matches the tested Postman filter exactly
const PO_FILTER =
  "DocumentApprovalStatus eq Microsoft.Dynamics.DataEntities.VersioningDocumentState'Confirmed'" +
  " and PurchaseOrderStatus eq Microsoft.Dynamics.DataEntities.PurchStatus'Backorder'";

/**
 * TEMPORARY (Elsewedy sandbox): the company under test. The detail/receipt flows can
 * only load one company at a time, so list queries scope to this same one — otherwise
 * tapping an order from another company 404s on the entity-key GET.
 */
const TEST_PO_COMPANY = '007';

/**
 * D365 custom service that confirms a purchase order.
 * TODO: verify the service group / service names against the deployed D365 service.
 */
const PO_CONFIRM_ACTION =
  '/api/services/GP_PurchOrderConfirmServiceGroup/GP_PurchOrderConfirmService/purchOrderConfirm';

/** The most orders one search returns. */
const SEARCH_LIMIT = 50;


@Injectable({ providedIn: 'root' })
export class PurchaseOrderService {
  private tenant = inject(TenantConfigStore);

  constructor(private api: ApiService, private authService: AuthService) { }

  /**
   * TEMPORARY: when environment.useTestPurchaseOrderEnv is on, routes GET /data
   * calls to the Elsewedy sandbox instead. See environment.testPurchaseOrderAuth.
   * On web this rewrites the path for proxy.conf.js / Vercel to catch; on native
   * (no proxy available) it hits environment.testPurchaseOrderD365BaseUrl directly.
   */
  private getData<T>(path: string, params?: Record<string, string>, useMainEnv = false): Observable<T> {
    if (!useMainEnv && testPurchaseOrderEnv.useTestPurchaseOrderEnv) {
      // The Elsewedy service principal's default company holds no purchase-order data,
      // so company-scoped reads look "successful" but come back empty: collection GETs
      // return HTTP 200 with `@odata.count: 0`, and entity-key GETs return 404. Opting
      // into cross-company makes D365 resolve rows outside that default company.
      const crossCompanyParams = { ...params, 'cross-company': 'true' };
      return from(this.authService.getTestPurchaseOrderToken()).pipe(
        switchMap((token) =>
          this.api.isNative
            ? this.api.getWithHeaders<T>(
                path,
              crossCompanyParams,
                { Authorization: `Bearer ${token}` },
                testPurchaseOrderEnv.testPurchaseOrderD365BaseUrl
              )
            : this.api.getWithHeaders<T>(
                path.replace('/data', '/api/test-data'),
              crossCompanyParams,
                { Authorization: `Bearer ${token}` }
              )
        )
      );
    }
    return this.api.get<T>(path, params);
  }

  /**
   * Cross-company reads span every legal entity, so on the test env the status filter
   * is narrowed to the company under test. The main env stays scoped by D365 itself.
   */
  private poFilterFor(useMainEnv = false): string {
    return !useMainEnv && testPurchaseOrderEnv.useTestPurchaseOrderEnv
      ? `dataAreaId eq '${TEST_PO_COMPANY}' and ${PO_FILTER}`
      : PO_FILTER;
  }

  private get poFilter(): string {
    return this.poFilterFor();
  }

  /**
   * The status filter, or none at all when `confirmedOnly` is off. The purchase
   * order list shows every order — drafts created in the app included — while
   * the receiving pickers keep to confirmed, open ones, because D365 cannot
   * receive against anything else.
   */
  private statusParams(confirmedOnly: boolean, useMainEnv = false): Record<string, string> {
    if (confirmedOnly) return { '$filter': this.poFilterFor(useMainEnv) };
    return !useMainEnv && testPurchaseOrderEnv.useTestPurchaseOrderEnv
      ? { '$filter': `dataAreaId eq '${TEST_PO_COMPANY}'` }
      : {};
  }

  /** The company reads should be scoped to for the given env. */
  private companyFor(useMainEnv: boolean): string {
    return !useMainEnv && testPurchaseOrderEnv.useTestPurchaseOrderEnv ? TEST_PO_COMPANY : this.tenant.currentDataAreaId();
  }

  /**
   * TEMPORARY: when environment.useTestPurchaseOrderEnv is on, routes POST /api/services
   * calls to the Elsewedy sandbox instead. See environment.testPurchaseOrderAuth.
   * Same native/web split as getData above.
   */
  private postServices<T>(path: string, body: unknown): Observable<T> {
    if (testPurchaseOrderEnv.useTestPurchaseOrderEnv) {
      return from(this.authService.getTestPurchaseOrderToken()).pipe(
        switchMap((token) =>
          this.api.isNative
            ? this.api.postWithHeaders<T>(
                path,
                body,
                { Authorization: `Bearer ${token}` },
                testPurchaseOrderEnv.testPurchaseOrderD365BaseUrl
              )
            : this.api.postWithHeaders<T>(
                path.replace('/api/services', '/api/test-services'),
                body,
                { Authorization: `Bearer ${token}` }
              )
        )
      );
    }
    return this.api.post<T>(path, body);
  }

  getOrderHeaders(skip = 0, confirmedOnly = true): Observable<ODataResponse<PurchaseOrderHeader>> {
    return this.getData<ODataResponse<PurchaseOrderHeader>>(
      '/data/PurchaseOrderHeadersV2',
      {
        '$top': String(PO_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        ...this.statusParams(confirmedOnly),
        '$orderby': 'PurchaseOrderNumber desc',
      }
    );
  }

  getAllOrderHeaders(useMainEnv = false, confirmedOnly = true): Observable<ODataResponse<PurchaseOrderHeader>> {
    return this.getData<ODataResponse<PurchaseOrderHeader>>(
      '/data/PurchaseOrderHeadersV2',
      {
        '$count': 'true',
        ...this.statusParams(confirmedOnly, useMainEnv),
        '$orderby': 'PurchaseOrderNumber desc',
      },
      useMainEnv
    );
  }

  /**
   * Orders of any status whose number or vendor account starts with the term,
   * or that have a line for an item starting with it — newest first, at most
   * SEARCH_LIMIT. Every query is capped server-side: the header table is far
   * too large (75k+ rows) to download and filter on the device, which is what
   * timed out at the gateway (504).
   *
   * D365 rejects contains/startswith and ge/lt on strings, so "starts with" is
   * its wildcard eq (`PurchaseOrderNumber eq 'PO-1*'`), which an index can
   * serve. Should that be refused, that part falls back to an exact match.
   */
  searchOrders(term: string): Observable<PurchaseOrderHeader[]> {
    const t = term.trim();
    const company = testPurchaseOrderEnv.useTestPurchaseOrderEnv ? `dataAreaId eq '${TEST_PO_COMPANY}' and ` : '';
    const headers = (filter: string, top = SEARCH_LIMIT) =>
      this.getData<ODataResponse<PurchaseOrderHeader>>('/data/PurchaseOrderHeadersV2', {
        '$filter': company + filter,
        '$top': String(top),
        '$orderby': 'PurchaseOrderNumber desc',
      }).pipe(map((res) => res.value));
    const startsWith = (field: string) => (fetch: (filter: string) => Observable<PurchaseOrderHeader[]>) =>
      fetch(prefixFilter(field, t)).pipe(catchError(() => fetch(`${field} eq '${odataString(t)}'`)));

    const byNumber$ = startsWith('PurchaseOrderNumber')((f) => headers(f));
    const byVendor$ = startsWith('OrderVendorAccountNumber')((f) => headers(f));

    const lineOrderNumbers = (filter: string) =>
      this.getData<ODataResponse<Pick<PurchaseOrderLine, 'PurchaseOrderNumber'>>>('/data/PurchaseOrderLinesV2', {
        '$filter': company + filter,
        '$select': 'PurchaseOrderNumber',
        '$top': String(SEARCH_LIMIT * 4),
        '$orderby': 'PurchaseOrderNumber desc',
      }).pipe(map((res) => [...new Set(res.value.map((l) => l.PurchaseOrderNumber))].slice(0, SEARCH_LIMIT)));
    const byItem$ = lineOrderNumbers(prefixFilter('ItemNumber', t)).pipe(
      catchError(() => lineOrderNumbers(`ItemNumber eq '${odataString(t)}'`)),
      switchMap((numbers) => (numbers.length ? this.headersByNumber(numbers, company) : of([])))
    );

    return forkJoin([byNumber$, byVendor$, byItem$]).pipe(
      map((groups) => {
        const seen = new Map<string, PurchaseOrderHeader>();
        for (const po of ([] as PurchaseOrderHeader[]).concat(...groups)) seen.set(po.PurchaseOrderNumber, po);
        return [...seen.values()]
          .sort((a, b) => b.PurchaseOrderNumber.localeCompare(a.PurchaseOrderNumber))
          .slice(0, SEARCH_LIMIT);
      })
    );
  }

  /** Headers for known order numbers, a few per request to keep the URL short. */
  private headersByNumber(numbers: string[], company: string): Observable<PurchaseOrderHeader[]> {
    const chunks: string[][] = [];
    for (let i = 0; i < numbers.length; i += 15) chunks.push(numbers.slice(i, i + 15));
    return forkJoin(
      chunks.map((chunk) =>
        this.getData<ODataResponse<PurchaseOrderHeader>>('/data/PurchaseOrderHeadersV2', {
          '$filter': company + '(' + chunk.map((n) => `PurchaseOrderNumber eq '${odataString(n)}'`).join(' or ') + ')',
          '$top': String(chunk.length),
        }).pipe(map((res) => res.value))
      )
    ).pipe(map((pages) => ([] as PurchaseOrderHeader[]).concat(...pages)));
  }

  /** All open (Confirmed + Backorder) orders with their lines expanded — used for cross-order item/barcode lookup. */
  getAllOpenOrdersWithLines(): Observable<ODataResponse<PurchaseOrderHeader>> {
    return this.getData<ODataResponse<PurchaseOrderHeader>>(
      '/data/PurchaseOrderHeadersV2',
      {
        '$count': 'true',
        '$filter': this.poFilter,
        '$orderby': 'PurchaseOrderNumber desc',
        '$expand': 'PurchaseOrderLinesV2',
      }
    );
  }

  // ── Create ─────────────────────────────────────────────────
  // Writes go to the tenant's own environment, never the temporary sandbox.

  /**
   * Every vendor, searched in memory by the caller: this D365 environment
   * rejects OData string functions (contains/startswith), so search cannot be
   * done server-side.
   *
   * Paged with $skip rather than @odata.nextLink — the link is an absolute D365
   * URL and would bypass the portal. Deliberately not cached on this
   * root service: a cache here would outlive sign-out and show the next
   * tenant's user someone else's vendors.
   */
  getVendors(): Observable<Vendor[]> {
    const page = (skip: number) =>
      this.api.get<ODataResponse<Vendor>>('/data/VendorsV3', {
        '$select': 'VendorAccountNumber,VendorOrganizationName',
        '$orderby': 'VendorAccountNumber asc',
        '$top': String(VENDOR_PAGE_SIZE),
        '$skip': String(skip),
      }).pipe(map((res) => ({ skip, rows: res.value })));

    return page(0).pipe(
      expand(({ skip, rows }) => (rows.length === VENDOR_PAGE_SIZE ? page(skip + VENDOR_PAGE_SIZE) : EMPTY)),
      reduce((all, { rows }) => all.concat(rows), [] as Vendor[])
    );
  }

  /** D365 numbers the order from its number sequence and returns it in the response. */
  createOrderHeader(dto: CreatePurchaseOrderHeaderDto): Observable<PurchaseOrderHeader> {
    return this.api.post<PurchaseOrderHeader>('/data/PurchaseOrderHeadersV2', dto);
  }

  createOrderLine(dto: CreatePurchaseOrderLineDto): Observable<PurchaseOrderLine> {
    return this.api.post<PurchaseOrderLine>('/data/PurchaseOrderLinesV2', dto);
  }

  /** Used only to roll back a header none of whose lines could be created. */
  deleteOrderHeader(poNumber: string, dataAreaId: string): Observable<void> {
    const key = (v: string) => encodeURIComponent(v.replace(/'/g, "''"));
    return this.api.delete<void>(
      `/data/PurchaseOrderHeadersV2(dataAreaId='${key(dataAreaId)}',PurchaseOrderNumber='${key(poNumber)}')`
    );
  }

  getOrderWithLines(
    poNumber: string,
    dataAreaId?: string,
    useMainEnv = false
  ): Observable<PurchaseOrderHeader> {
    const company = dataAreaId ?? this.companyFor(useMainEnv);
    return this.getData<PurchaseOrderHeader>(
      `/data/PurchaseOrderHeadersV2(dataAreaId='${company}',PurchaseOrderNumber='${poNumber}')`,
      { '$expand': 'PurchaseOrderLinesV2' },
      useMainEnv
    ).pipe(
      switchMap((po) =>
        this.getRemainingByLine(poNumber, company, useMainEnv).pipe(
          map((remainingByLine) => ({
            ...po,
            PurchaseOrderLinesV2: (po.PurchaseOrderLinesV2 ?? []).map((line) =>
              this.withRemainingQty(line, remainingByLine)
            ),
          }))
        )
      )
    );
  }

  /**
   * PurchaseOrderLinesV2 carries no remaining/received quantity field — D365 only
   * tracks that on ProductReceiptLinesV2, one row per line per posted receipt, where
   * RemainingPurchaseQuantity is the running balance as of that receipt. Lines with no
   * receipt yet simply have no row here, so they keep their full ordered quantity.
   */
  private getRemainingByLine(poNumber: string, dataAreaId: string, useMainEnv = false): Observable<Map<number, number>> {
    return this.getData<ODataResponse<ProductReceiptLine>>('/data/ProductReceiptLinesV2', {
      '$filter': `dataAreaId eq '${dataAreaId}' and PurchaseOrderNumber eq '${poNumber}'`,
      '$orderby': 'RecordId desc',
    }, useMainEnv).pipe(
      map((res) => {
        const remainingByLine = new Map<number, number>();
        for (const receiptLine of res.value) {
          // Descending order — first row seen per line is its latest receipt.
          if (!remainingByLine.has(receiptLine.PurchaseOrderLineNumber)) {
            remainingByLine.set(receiptLine.PurchaseOrderLineNumber, receiptLine.RemainingPurchaseQuantity);
          }
        }
        return remainingByLine;
      }),
      // Receipt history is a best-effort enrichment — if it fails, fall back to the
      // line's own (missing) field rather than breaking the whole order load.
      catchError(() => of(new Map<number, number>()))
    );
  }

  private withRemainingQty(line: PurchaseOrderLine, remainingByLine: Map<number, number>): PurchaseOrderLine {
    const remaining = remainingByLine.get(line.LineNumber);
    return remaining !== undefined ? { ...line, RemainingPurchaseQuantity: remaining } : line;
  }

  createProductReceipt(payload: CreateProductReceiptRequest): Observable<CreateProductReceiptResponse> {
    return this.postServices<CreateProductReceiptResponse>(
      '/api/services/GP_createProductReceiptServiceGroup/GP_CreateProductReceiptService/createProductReceipt',
      payload
    ).pipe(timeout(PRODUCT_RECEIPT_TIMEOUT_MS));
  }

  /**
   * Confirms an order so it can be received. Like create, this always targets the
   * tenant's own environment, never the temporary sandbox — the order was created there.
   */
  confirmOrder(payload: ConfirmPurchaseOrderRequest): Observable<ConfirmPurchaseOrderResponse> {
    return this.api.post<ConfirmPurchaseOrderResponse>(PO_CONFIRM_ACTION, payload)
      .pipe(timeout(PRODUCT_RECEIPT_TIMEOUT_MS));
  }

  /**
   * PO arrival registration — used by the Register module.
   *
   * Deliberately NOT routed through postServices(): GP_PORegistrationAPIService is
   * deployed on the main D365 env only (gp-customers), and the Elsewedy test sandbox
   * returns 404 for it. So this always targets the main env, whatever
   * useTestPurchaseOrderEnv is set to — which is why the Register module's reads pass
   * useMainEnv too, so it lists and registers against the same company.
   */
  registerPurchaseOrder(payload: RegisterPurchaseOrderRequest): Observable<RegisterPurchaseOrderResponse> {
    return this.api.post<RegisterPurchaseOrderResponse>(
      '/api/services/GP_PORegistrationAPIServiceGroup/GP_PORegistrationAPIService/registerPurchaseOrder',
      payload
    ).pipe(timeout(PRODUCT_RECEIPT_TIMEOUT_MS));
  }
}
