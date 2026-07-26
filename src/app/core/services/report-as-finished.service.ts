import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { delay } from 'rxjs/operators';
import { ODataResponse } from '../models/lookup.models';
import { ProductionOrder, ReportAsFinishedPayload, ReportAsFinishedResponse } from '../../models/inventory.model';

// TODO: Replace with a real D365 OData query (likely ProductionOrdersV2 — the same
// "production table" entity already integrated for Production Issue) once the
// business confirms which statuses/fields count as eligible for Report as Finished.
const DUMMY_PRODUCTION_ORDERS: ProductionOrder[] = [
  { ProductionOrderNumber: 'PO-000123', ItemNumber: 'FG-1001', ItemName: 'Steel Bracket 40mm', OrderedQuantity: 500, ReportedQuantity: 200, RemainingQuantity: 300, WarehouseId: '11', ProductionOrderStatus: 'Started', dataAreaId: 'usmf' },
  { ProductionOrderNumber: 'PO-000124', ItemNumber: 'FG-1002', ItemName: 'Aluminum Panel 2x4', OrderedQuantity: 150, ReportedQuantity: 0, RemainingQuantity: 150, WarehouseId: '12', ProductionOrderStatus: 'Released', dataAreaId: 'usmf' },
  { ProductionOrderNumber: 'PO-000125', ItemNumber: 'FG-1003', ItemName: 'Plastic Housing Unit', OrderedQuantity: 1000, ReportedQuantity: 750, RemainingQuantity: 250, WarehouseId: '11', ProductionOrderStatus: 'Started', dataAreaId: 'usmf' },
  { ProductionOrderNumber: 'PO-000126', ItemNumber: 'FG-1004', ItemName: 'Copper Wiring Coil', OrderedQuantity: 80, ReportedQuantity: 0, RemainingQuantity: 80, WarehouseId: '13', ProductionOrderStatus: 'Released', dataAreaId: 'usmf' },
  { ProductionOrderNumber: 'PO-000127', ItemNumber: 'FG-1005', ItemName: 'Rubber Gasket Set', OrderedQuantity: 300, ReportedQuantity: 60, RemainingQuantity: 240, WarehouseId: '12', ProductionOrderStatus: 'Started', dataAreaId: 'usmf' },
];

@Injectable({ providedIn: 'root' })
export class ReportAsFinishedService {

  /** TODO: dummy data until the D365 "production table" API is wired for this feature. */
  getOpenProductionOrders(): Observable<ODataResponse<ProductionOrder>> {
    return of({ value: DUMMY_PRODUCTION_ORDERS, '@odata.count': DUMMY_PRODUCTION_ORDERS.length }).pipe(delay(500));
  }

  /** TODO: dummy stub until the D365 "Report as Finished" custom service action is wired. */
  reportAsFinished(payload: ReportAsFinishedPayload): Observable<ReportAsFinishedResponse> {
    console.warn('ReportAsFinishedService.reportAsFinished: backend API not yet wired — returning simulated success.');
    return of({ Success: true, ReportId: payload.reportId }).pipe(delay(700));
  }
}
