import { Injectable } from '@angular/core';
import { catchError, from, map, Observable, of, switchMap, timeout } from 'rxjs';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { ODataResponse } from '../models/lookup.models';
import {
  PurchaseOrderHeader,
  PurchaseOrderLine,
  ProductReceiptLine,
  CreateProductReceiptRequest,
  CreateProductReceiptResponse,
} from '../../models/purchase-order.model';
import { testPurchaseOrderEnv } from '../../../environments/test-purchase-order-env';

export const PO_PAGE_SIZE = 10;

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


@Injectable({ providedIn: 'root' })
export class PurchaseOrderService {
  constructor(private api: ApiService, private authService: AuthService) { }

  /**
   * TEMPORARY: when environment.useTestPurchaseOrderEnv is on, routes GET /data
   * calls to the Elsewedy sandbox instead. See environment.testPurchaseOrderAuth.
   * On web this rewrites the path for proxy.conf.js / Vercel to catch; on native
   * (no proxy available) it hits environment.testPurchaseOrderD365BaseUrl directly.
   */
  private getData<T>(path: string, params?: Record<string, string>): Observable<T> {
    if (testPurchaseOrderEnv.useTestPurchaseOrderEnv) {
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
  private get poFilter(): string {
    return testPurchaseOrderEnv.useTestPurchaseOrderEnv
      ? `dataAreaId eq '${TEST_PO_COMPANY}' and ${PO_FILTER}`
      : PO_FILTER;
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

  getOrderHeaders(skip = 0): Observable<ODataResponse<PurchaseOrderHeader>> {
    return this.getData<ODataResponse<PurchaseOrderHeader>>(
      '/data/PurchaseOrderHeadersV2',
      {
        '$top': String(PO_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$filter': this.poFilter,
        '$orderby': 'PurchaseOrderNumber desc',
      }
    );
  }

  getAllOrderHeaders(): Observable<ODataResponse<PurchaseOrderHeader>> {
    return this.getData<ODataResponse<PurchaseOrderHeader>>(
      '/data/PurchaseOrderHeadersV2',
      {
        '$count': 'true',
        '$filter': this.poFilter,
        '$orderby': 'PurchaseOrderNumber desc',
      }
    );
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

  getOrderWithLines(
    poNumber: string,
    dataAreaId: string = testPurchaseOrderEnv.useTestPurchaseOrderEnv ? TEST_PO_COMPANY : 'usmf'
  ): Observable<PurchaseOrderHeader> {
    return this.getData<PurchaseOrderHeader>(
      `/data/PurchaseOrderHeadersV2(dataAreaId='${dataAreaId}',PurchaseOrderNumber='${poNumber}')`,
      { '$expand': 'PurchaseOrderLinesV2' }
    ).pipe(
      switchMap((po) =>
        this.getRemainingByLine(poNumber, dataAreaId).pipe(
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
  private getRemainingByLine(poNumber: string, dataAreaId: string): Observable<Map<number, number>> {
    return this.getData<ODataResponse<ProductReceiptLine>>('/data/ProductReceiptLinesV2', {
      '$filter': `dataAreaId eq '${dataAreaId}' and PurchaseOrderNumber eq '${poNumber}'`,
      '$orderby': 'RecordId desc',
    }).pipe(
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
}
