import { Injectable } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import { TransferOrderHeader, TransferOrderLine } from '../../models/transfer-order.model';
import { TransferShipRequest, TransferReceiveRequest, TransferActionResponse } from '../../models/inventory.model';

export const TS_PAGE_SIZE = 10;

@Injectable({ providedIn: 'root' })
export class TransferShipmentService {
  constructor(private api: ApiService) {}

  // Orders ready to ship (status = Open / Created)
  getShippableOrders(warehouseId?: string, skip = 0): Observable<ODataResponse<TransferOrderHeader>> {
    let filter = `(TransferOrderStatus eq Microsoft.Dynamics.DataEntities.InventTransferStatus'Open' or TransferOrderStatus eq Microsoft.Dynamics.DataEntities.InventTransferStatus'Created')`;
    if (warehouseId) filter += ` and ShipmentWarehouseId eq '${warehouseId}'`;
    return this.api.get<ODataResponse<TransferOrderHeader>>(
      '/data/TransferOrderHeaders',
      {
        '$filter': filter,
        '$top': String(TS_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$orderby': 'TransferOrderNumber desc',
      }
    );
  }

  // Orders ready to receive (status = Shipped / in transit)
  getReceivableOrders(warehouseId?: string, skip = 0): Observable<ODataResponse<TransferOrderHeader>> {
    let filter = `TransferOrderStatus eq Microsoft.Dynamics.DataEntities.InventTransferStatus'Shipped'`;
    if (warehouseId) filter += ` and ReceivingWarehouseId eq '${warehouseId}'`;
    return this.api.get<ODataResponse<TransferOrderHeader>>(
      '/data/TransferOrderHeaders',
      {
        '$filter': filter,
        '$top': String(TS_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$orderby': 'TransferOrderNumber desc',
      }
    );
  }

  getOrderLines(transferOrderNumber: string): Observable<ODataResponse<TransferOrderLine>> {
    return this.api.get<ODataResponse<TransferOrderLine>>(
      '/data/TransferOrderLinesV2',
      { '$filter': `TransferOrderNumber eq '${transferOrderNumber}'` }
    );
  }

  getOrderWithLines(
    transferOrderNumber: string,
    dataAreaId = 'usmf'
  ): Observable<{ header: TransferOrderHeader; lines: TransferOrderLine[] }> {
    return forkJoin({
      header: this.api.get<TransferOrderHeader>(
        `/data/TransferOrderHeaders(dataAreaId='${dataAreaId}',TransferOrderNumber='${transferOrderNumber}')`
      ),
      linesResp: this.getOrderLines(transferOrderNumber),
    }).pipe(map(({ header, linesResp }) => ({ header, lines: linesResp.value })));
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
