import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import {
  SalesShipmentHeader,
  CreatePackingSlipRequest,
  CreatePackingSlipResponse,
} from '../../models/inventory.model';

export const SS_PAGE_SIZE = 10;

const SS_FILTER =
  "SalesOrderProcessingStatus eq Microsoft.Dynamics.DataEntities.SalesOrderProcessingStatus'Confirmed'" +
  " and RemainInventPhysical gt 0";

@Injectable({ providedIn: 'root' })
export class SalesShipmentService {
  constructor(private api: ApiService) {}

  getShippableOrders(skip = 0): Observable<ODataResponse<SalesShipmentHeader>> {
    return this.api.get<ODataResponse<SalesShipmentHeader>>(
      '/data/GP_SalesHeaderAndLineData',
      {
        '$filter': `dataAreaId eq 'usmf' and ${SS_FILTER}`,
        '$top': String(SS_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$orderby': 'SalesOrderNumber desc',
      }
    );
  }

  getAllShippableOrders(): Observable<ODataResponse<SalesShipmentHeader>> {
    return this.api.get<ODataResponse<SalesShipmentHeader>>(
      '/data/GP_SalesHeaderAndLineData',
      {
        '$filter': `dataAreaId eq 'usmf' and ${SS_FILTER}`,
        '$count': 'true',
        '$orderby': 'SalesOrderNumber desc',
      }
    );
  }

  getOrderWithLines(soNumber: string, dataAreaId = 'usmf'): Observable<SalesShipmentHeader> {
    return this.api.get<SalesShipmentHeader>(
      `/data/SalesOrderHeadersV3(dataAreaId='${dataAreaId}',SalesOrderNumber='${soNumber}')`,
      { '$expand': 'SalesOrderLines' }
    );
  }

  createPackingSlip(payload: CreatePackingSlipRequest): Observable<CreatePackingSlipResponse> {
    return this.api.post<CreatePackingSlipResponse>(
      '/api/services/GP_CreatePackingSlipServiceGroup/GP_CreatePackingSlipService/createPackingSlip',
      payload
    );
  }
}
