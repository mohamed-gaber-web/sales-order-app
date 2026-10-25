import { Injectable } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import { TransferOrderHeader, TransferOrderLine } from '../../models/transfer-order.model';
import {
  TransferShipRequest,
  TransferReceiveRequest,
  TransferActionResponse,
  TransferLineAction,
  TransferLineActionRequest,
  D365LicensePlate,
  D365WmsLocation,
  D365ItemBatch,
  D365ItemSerialNumber,
} from '../../models/inventory.model';

export const TS_PAGE_SIZE = 10;

const TRANSFER_SERVICE_PATH = '/api/services/GP_transferOrderAPIServiceGroup/GP_transferOrderAPIService';

// Line reservation, pick and registration live on the portal service, not the
// transfer order service; D365 answers 404 on the transfer order service.
const TRANSFER_LINE_SERVICE_PATH = '/api/services/GP_portalServiceGroup/GP_portalService';

const TRANSFER_LINE_OPERATIONS: Record<TransferLineAction, string> = {
  reserve: 'transferLineReservation',
  pick: 'transferLinePick',
  register: 'transferLineRegistration',
};

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
      `${TRANSFER_SERVICE_PATH}/receiveTransferOrder`,
      payload
    );
  }

  // License plates the picker can choose from; its LicensePlateNumber is what
  // transferLinePick takes as LicensePlateId.
  getLicensePlates(): Observable<D365LicensePlate[]> {
    return this.api.get<ODataResponse<D365LicensePlate>>(
      '/data/LicensePlates',
      { '$select': 'LicensePlateNumber', '$orderby': 'LicensePlateNumber' }
    ).pipe(map(res => res.value));
  }

  // A transfer order carries no site; its shipping warehouse's operational site
  // is what transferLinePick takes as InventSiteId. '' when the warehouse isn't found.
  getWarehouseSiteId(warehouseId: string): Observable<string> {
    return this.api.get<ODataResponse<{ WarehouseId: string; OperationalSiteId?: string }>>('/data/Warehouses', {
      '$select': 'WarehouseId,OperationalSiteId',
      '$filter': `WarehouseId eq '${warehouseId.replace(/'/g, "''")}'`,
    }).pipe(map(res => res.value[0]?.OperationalSiteId ?? ''));
  }

  // Warehouse locations the picker can choose from; its wMSLocationId is what
  // transferLinePick takes as WMSLocationId. Narrowed to one warehouse when given.
  getWmsLocations(warehouseId?: string): Observable<D365WmsLocation[]> {
    const params: Record<string, string> = {
      '$select': 'inventLocationId,wMSLocationId',
      '$orderby': 'wMSLocationId',
    };
    if (warehouseId) params['$filter'] = `inventLocationId eq '${warehouseId.replace(/'/g, "''")}'`;
    return this.api.get<ODataResponse<D365WmsLocation>>('/data/WMSLocationBiEntities', params)
      .pipe(map(res => res.value));
  }

  // One item's batches; its BatchNumber is what transferLinePick takes as InventBatchId.
  getItemBatches(itemNumber: string): Observable<D365ItemBatch[]> {
    return this.api.get<ODataResponse<D365ItemBatch>>('/data/ItemBatches', {
      '$select': 'ItemNumber,BatchNumber',
      '$filter': `ItemNumber eq '${itemNumber.replace(/'/g, "''")}'`,
      '$orderby': 'BatchNumber',
    }).pipe(map(res => res.value));
  }

  // One item's serial numbers; its SerialNumber is what transferLinePick takes as InventSerialId.
  getItemSerialNumbers(itemNumber: string): Observable<D365ItemSerialNumber[]> {
    return this.api.get<ODataResponse<D365ItemSerialNumber>>('/data/ItemSerialNumbers', {
      '$select': 'ItemNumber,SerialNumber',
      '$filter': `ItemNumber eq '${itemNumber.replace(/'/g, "''")}'`,
      '$orderby': 'SerialNumber',
    }).pipe(map(res => res.value));
  }

  // Reservation, pick and registration all take one line per call.
  transferLineAction(action: TransferLineAction, payload: TransferLineActionRequest): Observable<TransferActionResponse> {
    return this.api.post<TransferActionResponse>(
      `${TRANSFER_LINE_SERVICE_PATH}/${TRANSFER_LINE_OPERATIONS[action]}`,
      payload
    );
  }
}
