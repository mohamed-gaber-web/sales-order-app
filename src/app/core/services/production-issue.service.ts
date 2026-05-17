import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ApiService } from './api.service';
import { ODataResponse } from '../models/lookup.models';
import { ProductionOrder, ProductionIssuePayload } from '../../models/inventory.model';

export const PROD_PAGE_SIZE = 10;

@Injectable({ providedIn: 'root' })
export class ProductionIssueService {
  constructor(private api: ApiService) {}

  getOpenProductionOrders(skip = 0): Observable<ODataResponse<ProductionOrder>> {
    return this.api.get<ODataResponse<ProductionOrder>>(
      '/data/ProductionOrdersV2',
      {
        '$filter': `ProductionOrderStatus ne Microsoft.Dynamics.DataEntities.ProdStatus'Ended'` +
                   ` and ProductionOrderStatus ne Microsoft.Dynamics.DataEntities.ProdStatus'Reported'`,
        '$top': String(PROD_PAGE_SIZE),
        '$skip': String(skip),
        '$count': 'true',
        '$orderby': 'ProductionOrderNumber desc',
      }
    );
  }

  getAllProductionOrders(): Observable<ODataResponse<ProductionOrder>> {
    return this.api.get<ODataResponse<ProductionOrder>>(
      '/data/ProductionOrdersV2',
      {
        '$filter': `ProductionOrderStatus ne Microsoft.Dynamics.DataEntities.ProdStatus'Ended'`,
        '$count': 'true',
        '$orderby': 'ProductionOrderNumber desc',
      }
    );
  }

  // Stub: post production picking journal to D365 when API is available
  postProductionIssue(payload: ProductionIssuePayload): Observable<{ success: boolean }> {
    console.warn('ProductionIssueService.postProductionIssue: backend API not yet wired');
    return of({ success: true });
  }
}
