import { inject, Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { catchError, concatMap, map, timeout, toArray } from 'rxjs/operators';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import {
  PostJournalRequest,
  PostJournalResponse,
  ProdRafRequest,
  ProdRafResponse,
  ProductionOrder,
  ProductionOrderHeader,
  ReportAsFinishedLine,
  ReportAsFinishedLineResult,
  ReportAsFinishedPayload,
  ReportAsFinishedResponse,
} from '../../models/inventory.model';

const PRODUCTION_ORDER_ENTITY = '/data/ProductionOrderHeaders';
const RAF_ACTION = '/api/services/GP_ProductionServiceGroup/GP_ProductionService/reportAsFinished';
const POST_JOURNAL_ACTION = '/api/services/GP_ProductionServiceGroup/GP_ProductionService/postJournal';

// D365 only allows reporting as finished from Released onwards, so anything still
// being planned (Created / Estimated / Scheduled) is filtered out here rather than
// letting the user pick an order the service would reject.
const RAF_ELIGIBLE_FILTER =
  `RemainingReportAsFinishedQuantity gt 0` +
  ` and (ProductionOrderStatus eq Microsoft.Dynamics.DataEntities.ProdStatus'Released'` +
  ` or ProductionOrderStatus eq Microsoft.Dynamics.DataEntities.ProdStatus'StartedUp')`;

const PRODUCTION_ORDER_SELECT = [
  'dataAreaId',
  'ProductionOrderNumber',
  'ItemNumber',
  'ProductionOrderName',
  'ProductionOrderStatus',
  'ScheduledQuantity',
  'EstimatedQuantity',
  'StartedQuantity',
  'RemainingReportAsFinishedQuantity',
  'ItemBatchNumber',
  'ProductionWarehouseId',
  'ProductionWarehouseLocationId',
].join(',');

// The entity rejects contains()/startswith() — "The type 'System.String' for the query
// operator is not Queryable" — so partial search can't run server-side. Eligible orders
// are fetched once and matched in memory instead; this caps how many are held.
const MAX_PRODUCTION_ORDERS = 500;

// Both operations run real D365 inventory work — same slow-but-legitimate profile as
// createProductReceipt, so they get the same allowance.
const SERVICE_TIMEOUT_MS = 90_000;

@Injectable({ providedIn: 'root' })
export class ReportAsFinishedService {
  private api = inject(ApiService);

  /** Production orders that still have a quantity left to report as finished. */
  getOpenProductionOrders(): Observable<ODataResponse<ProductionOrder>> {
    return this.api.get<ODataResponse<ProductionOrderHeader>>(
      PRODUCTION_ORDER_ENTITY,
      {
        'cross-company': 'true',
        '$select': PRODUCTION_ORDER_SELECT,
        '$filter': RAF_ELIGIBLE_FILTER,
        '$orderby': 'ProductionOrderNumber asc',
        '$top': String(MAX_PRODUCTION_ORDERS),
        '$count': 'true',
      }
    ).pipe(
      map((res) => ({ ...res, value: (res.value ?? []).map((row) => this.toProductionOrder(row)) }))
    );
  }

  /**
   * Reports each production order as finished through GP_ProductionService, then posts
   * the journal it produced. Orders run one after another so a failure on one leaves
   * the rest untouched — the caller gets a per-order outcome either way.
   */
  reportAsFinished(payload: ReportAsFinishedPayload): Observable<ReportAsFinishedResponse> {
    return from(payload.lines).pipe(
      concatMap((line) => this.reportLine(line)),
      toArray(),
      map((results) => ({
        Success: results.length > 0 && results.every((r) => r.reported),
        Results: results,
      }))
    );
  }

  private reportLine(line: ReportAsFinishedLine): Observable<ReportAsFinishedLineResult> {
    const base = {
      productionOrderNumber: line.productionOrderNumber,
      itemNumber: line.itemNumber,
      reportedQty: line.reportedQty,
    };

    return this.callReportAsFinished(line).pipe(
      concatMap((res) => {
        if (res?.Success === false) {
          return of({
            ...base,
            reported: false,
            posted: false,
            errorMessage: res.Message || 'D365 rejected the report as finished.',
          });
        }

        const journalNumber = this.extractJournalId(res, line.productionOrderNumber);
        const reportedOnly = {
          ...base,
          reported: true,
          posted: false,
          journalNumber,
          message: res?.Message,
        };

        // The contract returns no JournalId, so it can only come out of Message. Without
        // one there is nothing to post — report that plainly instead of guessing an id.
        if (!journalNumber) return of(reportedOnly);

        return this.postJournal(journalNumber, line.dataAreaId).pipe(
          map((post) => {
            // reportAsFinished may already have posted the journal in some builds; D365
            // saying so is a success for our purposes, not a failure to surface.
            const alreadyPosted = /already\s+posted|has\s+been\s+posted/i.test(
              post?.Message || post?.ErrorMessage || ''
            );
            if (post?.Success === false && !alreadyPosted) {
              return {
                ...reportedOnly,
                errorMessage: `Journal ${journalNumber} was created but not posted. ` +
                  (post.Message || post.ErrorMessage || post.DebugMessage || 'D365 rejected the posting.'),
              };
            }
            return { ...reportedOnly, posted: true };
          }),
          catchError((err) => of({
            ...reportedOnly,
            errorMessage: `Journal ${journalNumber} was created but not posted. ${this.extractError(err)}`,
          }))
        );
      }),
      catchError((err) => of({
        ...base,
        reported: false,
        posted: false,
        errorMessage: this.extractError(err),
      }))
    );
  }

  private callReportAsFinished(line: ReportAsFinishedLine): Observable<ProdRafResponse> {
    const request: ProdRafRequest = {
      _request: {
        DataAreaId: line.dataAreaId,
        ProductionOrderId: line.productionOrderNumber,
        GoodQuantity: line.reportedQty,
        ErrorQuantity: 0,
        BatchId: line.batchId ?? '',
        LocationId: line.locationId ?? '',
        TransDate: this.toJournalDate(new Date()),
        AcceptError: 'No',
        EndJob: 'No',
      },
    };
    return this.api.post<ProdRafResponse>(RAF_ACTION, request).pipe(timeout(SERVICE_TIMEOUT_MS));
  }

  private postJournal(journalId: string, dataAreaId: string): Observable<PostJournalResponse> {
    const request: PostJournalRequest = {
      _request: { JournalId: journalId, DataAreaId: dataAreaId },
    };
    return this.api.post<PostJournalResponse>(POST_JOURNAL_ACTION, request).pipe(
      timeout(SERVICE_TIMEOUT_MS)
    );
  }

  /**
   * Journal numbers look like `Prod_J-142742`. Prefer whatever follows the word
   * "journal" in the message; only then fall back to the first id-shaped token that
   * isn't the production order we just reported. A plain numeric journal number can't
   * be told apart from a date or quantity, so it is deliberately not matched — posting
   * a guessed id would post the wrong journal.
   */
  private extractJournalId(res: ProdRafResponse, productionOrderNumber: string): string | undefined {
    if (res?.JournalId) return res.JournalId;

    const message = res?.Message ?? '';
    const labelled = message.match(/journal\W{0,20}?([A-Za-z0-9][A-Za-z0-9_-]*\d)/i);
    if (labelled) return labelled[1];

    const tokens = message.match(/\b[A-Za-z][A-Za-z0-9]*[-_][A-Za-z0-9_-]*\d\b/g) ?? [];
    return tokens.find((t) => t.toLowerCase() !== productionOrderNumber.toLowerCase());
  }

  private toProductionOrder(row: ProductionOrderHeader): ProductionOrder {
    const ordered = this.num(row.ScheduledQuantity) || this.num(row.EstimatedQuantity);
    const remaining = this.num(row.RemainingReportAsFinishedQuantity);
    return {
      ProductionOrderNumber: row.ProductionOrderNumber,
      ItemNumber: row.ItemNumber,
      ItemName: row.ProductionOrderName,
      OrderedQuantity: ordered,
      ReportedQuantity: Math.max(0, ordered - remaining),
      RemainingQuantity: remaining,
      WarehouseId: row.ProductionWarehouseId,
      LocationId: row.ProductionWarehouseLocationId,
      ItemBatchNumber: row.ItemBatchNumber,
      ProductionOrderStatus: row.ProductionOrderStatus,
      dataAreaId: row.dataAreaId,
    };
  }

  private num(value: number | undefined): number {
    const n = Number(value);
    return isNaN(n) ? 0 : n;
  }

  /** D365 date fields land on midday UTC so a timezone shift can't move them a day. */
  private toJournalDate(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T12:00:00Z`;
  }

  private extractError(err: unknown): string {
    const e = err as { error?: { error?: { message?: string }; Message?: string; message?: string }; message?: string };
    return (
      e?.error?.error?.message ||
      e?.error?.Message ||
      e?.error?.message ||
      e?.message ||
      'D365 did not accept the report.'
    );
  }
}
