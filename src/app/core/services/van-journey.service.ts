import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { VanDay } from '../../models/van-journey.model';

/** The route this van is assigned to for the day. */
const ROUTE_ID = 'RT-CAI-04';

/**
 * Loads the driver's journey for the day — the ordered list of customer stops
 * plus the day's opening figures.
 *
 * SPEC (IKK Foods §4.6, §4.1): the live source is two custom OData entities that
 * are not yet deployed in this environment —
 *
 *   GET /data/GPJourneyPlanEntity
 *       ?$filter=SalespersonId eq '{rep}' and PlanDate eq {today}
 *       &$expand=Stops
 *   GET /data/GPRouteCustomerEntity
 *       ?$filter=RouteId eq '{route}'
 *       &$expand=Customer($select=CustomerAccount,OrganizationName,CreditLimit,...)
 *       &cross-company=true
 *
 * Until those ship, `loadToday` returns a representative seed so the whole van
 * cycle is exercisable end-to-end. Swap the body of `fetchToday` for the two
 * reads above (join stops to route customers) and nothing else in the flow
 * changes — every screen reads the day through {@link VanDayService}.
 */
@Injectable({ providedIn: 'root' })
export class VanJourneyService {
  /** The day to seed a fresh round with (or reload on pull-to-refresh). */
  loadToday(): Observable<VanDay> {
    return of(this.fetchToday());
  }

  private fetchToday(): VanDay {
    return {
      routeId: ROUTE_ID,
      open: true,
      visits: [
        {
          id: 1, account: 'CU-004501', name: 'Al Noor Supermarket',
          eta: '8:15', window: '8–11', mode: 'credit', balance: 0, limit: 20000,
          status: 'done', outcome: 'Sold + collected', checkedIn: true,
          lat: 20, lng: 100,
        },
        {
          id: 2, account: 'CU-004508', name: 'Al Salam Grocery',
          eta: '9:05', window: '8–12', mode: 'credit', balance: 2400, limit: 15000,
          status: 'done', outcome: 'Collected', checkedIn: true,
          lat: 60, lng: 85,
        },
        {
          id: 3, account: 'CU-004512', name: 'Al Fath Market — Faisal',
          eta: '9:50', window: '9–12', mode: 'credit', balance: 12300, limit: 30000,
          status: 'current', checkedIn: false,
          lat: 120, lng: 60,
        },
        {
          id: 4, account: 'CU-004515', name: 'Abu Omar Grocery',
          eta: '10:35', window: '', mode: 'cod', balance: 0, limit: 0,
          status: 'pending', checkedIn: false, priority: true,
          lat: 180, lng: 52,
        },
        {
          id: 5, account: 'CU-004520', name: 'Al Osra Hyper',
          eta: '11:10', window: '10–14', mode: 'credit', balance: 5600, limit: 25000,
          status: 'pending', checkedIn: false,
          lat: 250, lng: 45,
        },
      ],
      kpi: {
        planned: 12, visited: 2, sales: 11360, collected: 4000, returns: 0,
        adherence: 100, kmPlanned: 38, kmActual: 3.3,
      },
      outbox: {
        invoices: 14, collections: 9, returns: 2, customerRequests: 0, pending: 0,
      },
      openInvoices: [
        { invoiceId: 'INV-88103', date: 'Jul 26', amount: 6540, open: 6540 },
        { invoiceId: 'INV-87651', date: 'Jul 19', amount: 9760, open: 5760 },
      ],
    };
  }
}
