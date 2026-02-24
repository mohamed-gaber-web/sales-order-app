import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import {
  CreateSalesOrderHeaderDto,
  SalesOrderHeaderResponse,
} from '../../models/sales-order.model';

@Injectable({ providedIn: 'root' })
export class SalesOrderService {
  constructor(private api: ApiService) {}

  getOrderHeaders(): Observable<SalesOrderHeaderResponse[]> {
    return this.api
      .get<ODataResponse<SalesOrderHeaderResponse>>('/data/GP_SalesHeaderAndLineData', {
        '$count': 'true',
      })
      .pipe(map(res => res.value));
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
