import { inject, Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { catchError, concatMap, map, switchMap, toArray } from 'rxjs/operators';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import {
  CreateSalesOrderHeaderDto,
  SalesOrderHeaderResponse,
  SalesOrderHeaderV3Response,
  CreatePackingSlipRequest,
  PackingSlipResponse,
} from '../../models/sales-order.model';
import {
  CreateSalesOrderLineDto,
  SalesOrderLineService,
} from './sales-order-line.service';

/** Line payload for createOrderWithLines — order number/company come from the header */
export type ScanOrderLineDto = Omit<CreateSalesOrderLineDto, 'dataAreaId' | 'SalesOrderNumber'>;

export interface CreateOrderWithLinesResult {
  orderNumber: string;
  failedItems: string[];
}

export const SALES_PAGE_SIZE = 10;

const SALES_FILTER =
  "dataAreaId eq 'usmf' and RemainInventPhysical gt 0 " +
  "and SalesTable_SalesStatus eq Microsoft.Dynamics.DataEntities.SalesStatus'Backorder' " +
  "and SalesStatus eq Microsoft.Dynamics.DataEntities.SalesStatus'Backorder'";
const RETURN_FILTER =
  "dataAreaId eq 'usmf' " +
  "and (SalesType eq Microsoft.Dynamics.DataEntities.SalesType'ReturnItem' or RemainInventPhysical lt 0) " +
  "and SalesTable_SalesStatus eq Microsoft.Dynamics.DataEntities.SalesStatus'Backorder' " +
  "and SalesStatus eq Microsoft.Dynamics.DataEntities.SalesStatus'Backorder'";
const SALES_SELECT =
  'SalesId,CustAccount,SalesType,SalesTable_SalesName,SalesTable_InvoiceAccount,' +
  'SalesTable_SalesStatus,SalesTable_DocumentStatus,dataAreaId,CurrencyCode';

/**
 * The columns the journey screen needs, and only those.
 *
 * Narrower than `SALES_SELECT` on purpose: this feeds a list that shows a name
 * and a date, and an OData `$select` is the cheapest place to keep a van on a
 * mobile connection from paying for columns nothing renders.
 */
/**
 * How many of a day's orders the journey screen asks for at once.
 *
 * Larger than `SALES_PAGE_SIZE` because that list does not page: a driver's day
 * is read in one call, and cutting it at ten would hide stops with nothing on
 * screen to say so. A hundred is far past any single van's day.
 */
const JOURNEY_PAGE_SIZE = 100;

const SALES_TODAY_SELECT =
  'SalesOrderNumber,OrderingCustomerAccountNumber,SalesOrderName,' +
  'OrderCreationDateTime,RequestedShippingDate,SalesOrderStatus,dataAreaId';

/**
 * Midnight starting `date`'s local calendar day, as the instant it happened.
 *
 * `OrderCreationDateTime` is a true UTC timestamp, not D365's date-only noon
 * convention, so the day's bounds have to be sent as the UTC instants of local
 * midnight. Sending a bare `YYYY-MM-DDT00:00:00Z` instead would shift the
 * window by the offset: in Cairo it would cut the day at 03:00 local, hiding
 * orders created after midnight — exactly the ones a driver just made.
 */
function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The same instant, one calendar day later. Handles month and year ends. */
function nextDay(date: Date): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}

@Injectable({ providedIn: 'root' })
export class SalesOrderService {
  private api = inject(ApiService);
  private orderLineService = inject(SalesOrderLineService);

  getOrderHeaders(skip = 0, returnsOnly = false): Observable<ODataResponse<SalesOrderHeaderResponse>> {
    return this.api.get<ODataResponse<SalesOrderHeaderResponse>>(
      '/data/GP_SalesHeaderAndLineData',
      {
        '$top': String(SALES_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$filter': returnsOnly ? RETURN_FILTER : SALES_FILTER,
        '$select': SALES_SELECT,
        '$orderby': 'SalesId desc',
      }
    );
  }

  /**
   * Sales orders created on one calendar day, newest last.
   *
   * Keyed on `OrderCreationDateTime` rather than the requested shipping date:
   * an order written up at a stop is the driver's own work and belongs on the
   * screen the moment it exists, and D365 defaults the shipping date to the
   * session date, which is the previous day for anything entered after
   * midnight. Filtering on it dropped orders the driver had just created.
   *
   * Read from `SalesOrderHeadersV3`, not `GP_SalesHeaderAndLineData`: only the
   * header entity exposes a creation timestamp, and it is one row per order
   * where the joined entity repeats the header once per line.
   *
   * Expressed as a half-open range — `ge` midnight, `lt` the next midnight —
   * so an order created in the day's last second still counts and the next
   * day's first is not double-counted.
   */
  getOrdersForDate(
    date: Date = new Date(),
    skip = 0
  ): Observable<ODataResponse<SalesOrderHeaderV3Response>> {
    const from = startOfLocalDay(date);
    const to = nextDay(from);

    return this.api.get<ODataResponse<SalesOrderHeaderV3Response>>(
      '/data/SalesOrderHeadersV3',
      {
        '$top': String(JOURNEY_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$filter':
          `dataAreaId eq 'usmf'` +
          ` and OrderCreationDateTime ge ${from.toISOString()}` +
          ` and OrderCreationDateTime lt ${to.toISOString()}`,
        '$select': SALES_TODAY_SELECT,
        '$orderby': 'OrderCreationDateTime asc,SalesOrderNumber asc',
      }
    );
  }

  getAllOrderHeaders(returnsOnly = false): Observable<ODataResponse<SalesOrderHeaderResponse>> {
    return this.api.get<ODataResponse<SalesOrderHeaderResponse>>(
      '/data/GP_SalesHeaderAndLineData',
      {
        '$count': 'true',
        '$filter': returnsOnly ? RETURN_FILTER : SALES_FILTER,
        '$select': SALES_SELECT,
        '$orderby': 'SalesId desc',
      }
    );
  }

  createOrderHeader(
    dto: CreateSalesOrderHeaderDto
  ): Observable<SalesOrderHeaderResponse> {
    return this.api.post<SalesOrderHeaderResponse>(
      '/data/SalesOrderHeadersV3',
      dto
    );
  }

  /**
   * Creates the order header, then each line in sequence.
   * A failed line doesn't abort the rest — failed item numbers are
   * collected so the caller can report them. A failed header aborts.
   */
  createOrderWithLines(
    header: CreateSalesOrderHeaderDto,
    lines: ScanOrderLineDto[],
  ): Observable<CreateOrderWithLinesResult> {
    return this.createOrderHeader(header).pipe(
      switchMap(() =>
        from(lines).pipe(
          concatMap((line) =>
            this.orderLineService
              .createOrderLine({
                ...line,
                dataAreaId: header.dataAreaId,
                SalesOrderNumber: header.SalesOrderNumber,
              })
              .pipe(
                map(() => null),
                catchError(() => of(line.ItemNumber)),
              )
          ),
          toArray(),
          map((results) => ({
            orderNumber: header.SalesOrderNumber,
            failedItems: results.filter((r): r is string => r !== null),
          })),
        )
      ),
    );
  }

  createPackingSlip(payload: CreatePackingSlipRequest): Observable<PackingSlipResponse> {
    return this.api.post<PackingSlipResponse>(
      '/api/services/GP_CreatePackingSlipServiceGroup/GP_CreatePackingSlipService/createPackingSlip',
      payload
    );
  }
}
