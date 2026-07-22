import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import {
  PurchaseOrderHeader,
  CreateProductReceiptRequest,
  CreateProductReceiptResponse,
} from '../../models/purchase-order.model';

export const PO_PAGE_SIZE = 10;

// Matches the tested Postman filter exactly
const PO_FILTER =
  "DocumentApprovalStatus eq Microsoft.Dynamics.DataEntities.VersioningDocumentState'Confirmed'" +
  " and PurchaseOrderStatus eq Microsoft.Dynamics.DataEntities.PurchStatus'Backorder'";

@Injectable({ providedIn: 'root' })
export class PurchaseOrderService {
  constructor(private api: ApiService) {}

  getOrderHeaders(skip = 0): Observable<ODataResponse<PurchaseOrderHeader>> {
    return this.api.get<ODataResponse<PurchaseOrderHeader>>(
      '/data/PurchaseOrderHeadersV2',
      {
        '$top': String(PO_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$filter': PO_FILTER,
        '$orderby': 'PurchaseOrderNumber desc',
      }
    );
  }

  getAllOrderHeaders(): Observable<ODataResponse<PurchaseOrderHeader>> {
    return this.api.get<ODataResponse<PurchaseOrderHeader>>(
      '/data/PurchaseOrderHeadersV2',
      {
        '$count': 'true',
        '$filter': PO_FILTER,
        '$orderby': 'PurchaseOrderNumber desc',
      }
    );
  }

  /** All open (Confirmed + Backorder) orders with their lines expanded — used for cross-order item/barcode lookup. */
  getAllOpenOrdersWithLines(): Observable<ODataResponse<PurchaseOrderHeader>> {
    return this.api.get<ODataResponse<PurchaseOrderHeader>>(
      '/data/PurchaseOrderHeadersV2',
      {
        '$count': 'true',
        '$filter': PO_FILTER,
        '$orderby': 'PurchaseOrderNumber desc',
        '$expand': 'PurchaseOrderLinesV2',
      }
    );
  }

  getOrderWithLines(poNumber: string, dataAreaId = 'usmf'): Observable<PurchaseOrderHeader> {
    return this.api.get<PurchaseOrderHeader>(
      `/data/PurchaseOrderHeadersV2(dataAreaId='${dataAreaId}',PurchaseOrderNumber='${poNumber}')`,
      { '$expand': 'PurchaseOrderLinesV2' }
    );
  }

  createProductReceipt(payload: CreateProductReceiptRequest): Observable<CreateProductReceiptResponse> {
    return this.api.post<CreateProductReceiptResponse>(
      '/api/services/GP_createProductReceiptServiceGroup/GP_CreateProductReceiptService/createProductReceipt',
      payload
    );
  }
}
