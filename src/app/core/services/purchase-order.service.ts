import { Injectable } from '@angular/core';
import { catchError, from, map, Observable, of, switchMap, timeout } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import {
  PurchaseOrderHeader,
  PurchaseOrderLine,
  ProductReceiptLine,
  CreateProductReceiptRequest,
  CreateProductReceiptResponse,
  RegisterPurchaseOrderRequest,
  RegisterPurchaseOrderResponse,
} from '../../models/purchase-order.model';

export const PO_PAGE_SIZE = 10;

// D365 custom-action services (createProductReceipt) can legitimately run slow —
// long enough to give a real slow response a chance, short enough that the loading
// UI doesn't hang forever when D365 stalls.
const PRODUCT_RECEIPT_TIMEOUT_MS = 90_000;

// Matches the tested Postman filter exactly
const PO_FILTER =
  "DocumentApprovalStatus eq Microsoft.Dynamics.DataEntities.VersioningDocumentState'Confirmed'" +
  " and PurchaseOrderStatus eq Microsoft.Dynamics.DataEntities.PurchStatus'Backorder'";



@Injectable({ providedIn: 'root' })
export class PurchaseOrderService {
  constructor(private api: ApiService) { }

  /**
   * A read against the ERP.
   *
   * Was a fork: normally the tenant's own D365, but with a flag set, the
   * Elsewedy sandbox — reached by minting a second `client_credentials` token
   * from a second client secret held in a local environment file, and by
   * rewriting `/data` to `/api/test-data` so a dev-server proxy would catch it.
   * That was a second copy of exactly the arrangement US-040 removed, and it is
   * gone. A second ERP is now a second `d365_environment` row, chosen by
   * company, with its secret sealed on the server like the first one.
   *
   * `useMainEnv` survives as a no-op parameter so the dozen call sites that pass
   * it did not all have to change in the same commit as the credential removal.
   */
  private getData<T>(path: string, params?: Record<string, string>, useMainEnv = false): Observable<T> {
    void useMainEnv;
    return this.api.get<T>(path, params);
  }

  /** The purchase-order filter. One environment now, so one filter. */
  private poFilterFor(useMainEnv = false): string {
    void useMainEnv;
    return PO_FILTER;
  }

  private get poFilter(): string {
    return this.poFilterFor();
  }

  /**
   * The company reads are scoped to.
   *
   * Still the hardcoded `usmf` that fifty-three files in this app assume.
   * Deliberately unchanged here: making it come from the selected company is the
   * multi-company migration, and doing it inside the credential removal would
   * mean one commit that both moved a secret and changed which data every screen
   * shows.
   */
  private companyFor(useMainEnv: boolean): string {
    void useMainEnv;
    return 'usmf';
  }

  /** A custom-service call against the ERP. See `getData` for what was removed. */
  private postServices<T>(path: string, body: unknown): Observable<T> {
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

  getAllOrderHeaders(useMainEnv = false): Observable<ODataResponse<PurchaseOrderHeader>> {
    return this.getData<ODataResponse<PurchaseOrderHeader>>(
      '/data/PurchaseOrderHeadersV2',
      {
        '$count': 'true',
        '$filter': this.poFilterFor(useMainEnv),
        '$orderby': 'PurchaseOrderNumber desc',
      },
      useMainEnv
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
