import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import {
  TransferOrderHeader,
  TransferOrderLine,
  CreateTransferOrderHeaderDto,
  CreateTransferOrderLineDto,
} from '../../models/transfer-order.model';
import { TransferShipRequest, TransferReceiveRequest, TransferActionResponse } from '../../models/inventory.model';
import { TenantConfigStore } from '../tenant/tenant-config.store';

export const TO_PAGE_SIZE = 10;

const TO_FILTER = "TransferOrderStatus ne Microsoft.Dynamics.DataEntities.InventTransferStatus'Received'";

@Injectable({ providedIn: 'root' })
export class TransferOrderService {
  private tenant = inject(TenantConfigStore);

  constructor(private api: ApiService) {}

  getOrderHeaders(skip = 0): Observable<ODataResponse<TransferOrderHeader>> {
    return this.api.get<ODataResponse<TransferOrderHeader>>(
      '/data/TransferOrderHeaders',
      {
        '$top': String(TO_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$filter': TO_FILTER,
        '$orderby': 'TransferOrderNumber desc',
      }
    );
  }

  getAllOrderHeaders(): Observable<ODataResponse<TransferOrderHeader>> {
    return this.api.get<ODataResponse<TransferOrderHeader>>(
      '/data/TransferOrderHeaders',
      {
        '$count': 'true',
        '$filter': TO_FILTER,
        '$orderby': 'TransferOrderNumber desc',
      }
    );
  }

  getOrderHeader(transferOrderNumber: string, dataAreaId = this.tenant.currentDataAreaId()): Observable<TransferOrderHeader> {
    return this.api.get<TransferOrderHeader>(
      `/data/TransferOrderHeaders(dataAreaId='${dataAreaId}',TransferOrderNumber='${transferOrderNumber}')`
    );
  }

  getOrderLines(transferOrderNumber: string): Observable<ODataResponse<TransferOrderLine>> {
    return this.api.get<ODataResponse<TransferOrderLine>>(
      '/data/TransferOrderLinesV2',
      { '$filter': `TransferOrderNumber eq '${transferOrderNumber}'` }
    );
  }

  getOrderWithLines(transferOrderNumber: string, dataAreaId = this.tenant.currentDataAreaId()): Observable<{ header: TransferOrderHeader; lines: TransferOrderLine[] }> {
    return forkJoin({
      header: this.getOrderHeader(transferOrderNumber, dataAreaId),
      linesResp: this.getOrderLines(transferOrderNumber),
    }).pipe(
      map(({ header, linesResp }) => ({
        header,
        lines: linesResp.value,
      }))
    );
  }

  /** D365 numbers the order from its number sequence and returns it in the response. */
  createOrderHeader(dto: CreateTransferOrderHeaderDto): Observable<TransferOrderHeader> {
    return this.api.post<TransferOrderHeader>('/data/TransferOrderHeaders', dto);
  }

  createOrderLine(dto: CreateTransferOrderLineDto): Observable<TransferOrderLine> {
    return this.api.post<TransferOrderLine>('/data/TransferOrderLines', dto);
  }

  /** Used only to roll back a header none of whose lines could be created. */
  deleteOrderHeader(transferOrderNumber: string, dataAreaId = this.tenant.currentDataAreaId()): Observable<void> {
    return this.api.delete<void>(
      `/data/TransferOrderHeaders(dataAreaId='${dataAreaId}',TransferOrderNumber='${transferOrderNumber}')`
    );
  }

  shipTransferOrder(payload: TransferShipRequest): Observable<TransferActionResponse> {
    return this.api.post<TransferActionResponse>(
      '/api/services/GP_transferOrderAPIServiceGroup/GP_transferOrderAPIService/shipmentTransferOrder',
      payload
    );
  }

  receiveTransferOrder(payload: TransferReceiveRequest): Observable<TransferActionResponse> {
    return this.api.post<TransferActionResponse>(
      '/api/services/GP_transferOrderAPIServiceGroup/GP_transferOrderAPIService/receiveTransferOrder',
      payload
    );
  }
}
