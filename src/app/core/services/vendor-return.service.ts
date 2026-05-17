import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import { PurchaseOrderHeader } from '../../models/purchase-order.model';
import { VendorReturnPayload } from '../../models/inventory.model';

export const VR_PAGE_SIZE = 10;

const VR_FILTER =
  "DocumentApprovalStatus eq Microsoft.Dynamics.DataEntities.VersioningDocumentState'Confirmed'" +
  " and PurchaseOrderStatus eq Microsoft.Dynamics.DataEntities.PurchStatus'Backorder'";

@Injectable({ providedIn: 'root' })
export class VendorReturnService {
  constructor(private api: ApiService) {}

  getEligibleOrders(skip = 0): Observable<ODataResponse<PurchaseOrderHeader>> {
    return this.api.get<ODataResponse<PurchaseOrderHeader>>(
      '/data/PurchaseOrderHeadersV2',
      {
        '$top': String(VR_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$filter': VR_FILTER,
        '$orderby': 'PurchaseOrderNumber desc',
      }
    );
  }

  getAllEligibleOrders(): Observable<ODataResponse<PurchaseOrderHeader>> {
    return this.api.get<ODataResponse<PurchaseOrderHeader>>(
      '/data/PurchaseOrderHeadersV2',
      {
        '$count': 'true',
        '$filter': VR_FILTER,
        '$orderby': 'PurchaseOrderNumber desc',
      }
    );
  }

  getOrderWithLines(poNumber: string, dataAreaId = 'usmf'): Observable<PurchaseOrderHeader> {
    return this.api.get<PurchaseOrderHeader>(
      `/data/PurchaseOrderHeadersV2(dataAreaId='${dataAreaId}',PurchaseOrderNumber='${poNumber}')`,
      { '$expand': 'PurchaseOrderLinesV2' }
    );
  }

  // Stub: vendor return posting when D365 API is available
  postVendorReturn(payload: VendorReturnPayload): Observable<{ success: boolean }> {
    console.warn('VendorReturnService.postVendorReturn: backend API not yet wired');
    return this.api.post<{ success: boolean }>(
      '/api/services/GP_vendorReturnServiceGroup/GP_VendorReturnService/postVendorReturn',
      payload
    );
  }
}
