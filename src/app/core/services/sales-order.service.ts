import { inject, Injectable } from '@angular/core';
import { from, Observable, of } from 'rxjs';
import { catchError, concatMap, map, switchMap, toArray } from 'rxjs/operators';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import {
  CreateSalesOrderHeaderDto,
  SalesOrderHeaderResponse,
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
const SALES_TODAY_SELECT =
  'SalesId,CustAccount,SalesTable_SalesName,ShippingDateRequested,' +
  'SalesTable_SalesStatus,dataAreaId';

/**
 * A local calendar day as `YYYY-MM-DD`.
 *
 * Built from the local parts rather than `toISOString()`, which converts to UTC
 * first: east of Greenwich that returns yesterday for most of the morning, and
 * a driver asking for today's orders at 08:00 in Cairo would be shown
 * yesterday's. A van's day is the day where the van is.
 */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The same day, one calendar day later. Handles month and year ends. */
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
   * Sales orders whose requested shipping date falls on one calendar day.
   *
   * Expressed as a half-open range — `ge` midnight, `lt` the next midnight —
   * rather than `eq` on the date. Two reasons. `ShippingDateRequested` comes
   * back as a timestamp, so an `eq` against a bare date matches only rows whose
   * time component is exactly midnight, which is most of them until it is not.
   * And a range is the one form that behaves the same whether D365 types the
   * column as `Edm.Date` or `Edm.DateTimeOffset`, which differs by entity.
   *
   * Only `dataAreaId` is applied besides the date. The Backorder-and-remaining-
   * quantity clauses in `SALES_FILTER` describe orders still to be picked, which
   * is a different question from what is scheduled today.
   */
  getOrdersForDate(
    date: Date = new Date(),
    skip = 0
  ): Observable<ODataResponse<SalesOrderHeaderResponse>> {
    const from = localDay(date);
    const to = localDay(nextDay(date));

    return this.api.get<ODataResponse<SalesOrderHeaderResponse>>(
      '/data/GP_SalesHeaderAndLineData',
      {
        '$top': String(SALES_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$filter':
          `dataAreaId eq 'usmf'` +
          ` and ShippingDateRequested ge ${from}T00:00:00Z` +
          ` and ShippingDateRequested lt ${to}T00:00:00Z`,
        '$select': SALES_TODAY_SELECT,
        '$orderby': 'ShippingDateRequested asc,SalesId asc',
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
