import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import {
  CreateSalesOrderHeaderDto,
  SalesOrderHeaderResponse,
} from '../../models/sales-order.model';

export const SALES_PAGE_SIZE = 10;

const SALES_FILTER =
  "dataAreaId eq 'usmf' and RemainInventPhysical gt 0 " +
  "and SalesTable_SalesStatus eq Microsoft.Dynamics.DataEntities.SalesStatus'Backorder' " +
  "and SalesStatus eq Microsoft.Dynamics.DataEntities.SalesStatus'Backorder'";
const SALES_SELECT =
  'SalesId,CustAccount,SalesType,SalesTable_SalesName,SalesTable_InvoiceAccount,' +
  'SalesTable_SalesStatus,SalesTable_DocumentStatus,dataAreaId,CurrencyCode';

@Injectable({ providedIn: 'root' })
export class SalesOrderService {
  constructor(private api: ApiService) {}

  getOrderHeaders(skip = 0, search = ''): Observable<ODataResponse<SalesOrderHeaderResponse>> {
    let filter = SALES_FILTER;
    if (search) {
      const s = search.replace(/'/g, "''");
      filter += ` and (contains(SalesId,'${s}') or contains(CustAccount,'${s}') or contains(SalesTable_SalesName,'${s}') or contains(SalesTable_InvoiceAccount,'${s}'))`;
    }

    return this.api.get<ODataResponse<SalesOrderHeaderResponse>>(
      '/data/GP_SalesHeaderAndLineData',
      {
        '$top': String(SALES_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$filter': filter,
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
}
