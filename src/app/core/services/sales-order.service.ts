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

const RETURN_FILTER =
  "dataAreaId eq 'usmf' " +
  "and (SalesType eq Microsoft.Dynamics.DataEntities.SalesType'ReturnItem' or RemainInventPhysical lt 0) " +
  "and SalesTable_SalesStatus eq Microsoft.Dynamics.DataEntities.SalesStatus'Backorder' " +
  "and SalesStatus eq Microsoft.Dynamics.DataEntities.SalesStatus'Backorder'";
const SALES_SELECT =
  'SalesId,CustAccount,SalesType,SalesTable_SalesName,SalesTable_InvoiceAccount,' +
  'SalesTable_SalesStatus,SalesTable_DocumentStatus,dataAreaId,CurrencyCode';

const CONFIRMED_ORDERS_FILTER =
  "dataAreaId eq 'usmf' and SalesOrderProcessingStatus eq Microsoft.Dynamics.DataEntities.SalesOrderProcessingStatus'Confirmed'";
const CONFIRMED_ORDERS_SELECT =
  'dataAreaId,SalesOrderNumber,OrderingCustomerAccountNumber,SalesOrderName,' +
  'InvoiceCustomerAccountNumber,SalesOrderStatus,CurrencyCode';

function mapV3ToHeaderResponse(row: SalesOrderHeaderV3Response): SalesOrderHeaderResponse {
  return {
    dataAreaId: row.dataAreaId,
    CurrencyCode: row.CurrencyCode,
    SalesId: row.SalesOrderNumber,
    CustAccount: row.OrderingCustomerAccountNumber,
    SalesTable_SalesName: row.SalesOrderName,
    SalesTable_InvoiceAccount: row.InvoiceCustomerAccountNumber,
    SalesTable_SalesStatus: row.SalesOrderStatus,
    SalesOrderLines: row.SalesOrderLines,
  };
}

@Injectable({ providedIn: 'root' })
export class SalesOrderService {
  private api = inject(ApiService);
  private orderLineService = inject(SalesOrderLineService);

  getOrderHeaders(skip = 0, returnsOnly = false): Observable<ODataResponse<SalesOrderHeaderResponse>> {
    if (returnsOnly) {
      return this.api.get<ODataResponse<SalesOrderHeaderResponse>>(
        '/data/GP_SalesHeaderAndLineData',
        {
          '$top': String(SALES_PAGE_SIZE),
          '$skip': String(skip),
          '$count': 'true',
          '$filter': RETURN_FILTER,
          '$select': SALES_SELECT,
          '$orderby': 'SalesId desc',
        }
      );
    }
    return this.getConfirmedOrders({
      '$top': String(SALES_PAGE_SIZE),
      '$skip': String(skip),
    });
  }

  getAllOrderHeaders(returnsOnly = false): Observable<ODataResponse<SalesOrderHeaderResponse>> {
    if (returnsOnly) {
      return this.api.get<ODataResponse<SalesOrderHeaderResponse>>(
        '/data/GP_SalesHeaderAndLineData',
        {
          '$count': 'true',
          '$filter': RETURN_FILTER,
          '$select': SALES_SELECT,
          '$orderby': 'SalesId desc',
        }
      );
    }
    return this.getConfirmedOrders({});
  }

  private getConfirmedOrders(pagination: Record<string, string>): Observable<ODataResponse<SalesOrderHeaderResponse>> {
    return this.api.get<ODataResponse<SalesOrderHeaderV3Response>>(
      '/data/SalesOrderHeadersV3',
      {
        ...pagination,
        '$count': 'true',
        '$filter': CONFIRMED_ORDERS_FILTER,
        '$select': CONFIRMED_ORDERS_SELECT,
        '$expand': 'SalesOrderLines',
        '$orderby': 'SalesOrderNumber desc',
      }
    ).pipe(
      map((res) => ({
        ...res,
        value: res.value.map(mapV3ToHeaderResponse),
      }))
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
