import { Injectable } from '@angular/core';
import { Observable, forkJoin, map } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import { TransferOrderHeader, TransferOrderLine } from '../../models/transfer-order.model';

export const TO_PAGE_SIZE = 10;

const TO_FILTER = "TransferOrderStatus ne Microsoft.Dynamics.DataEntities.InventTransferStatus'Received'";

@Injectable({ providedIn: 'root' })
export class TransferOrderService {
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

  getOrderHeader(transferOrderNumber: string, dataAreaId = 'usmf'): Observable<TransferOrderHeader> {
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

  getOrderWithLines(transferOrderNumber: string, dataAreaId = 'usmf'): Observable<{ header: TransferOrderHeader; lines: TransferOrderLine[] }> {
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
}
