import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { GeoPoint, VanDay } from '../../models/van-journey.model';

/** The route this van is assigned to for the day. */
const ROUTE_ID = 'RT-CAI-04';

/**
 * Where the route loads and unloads — the Giza branch.
 *
 * Origin of last resort for route ordering: used when the device has no fix and
 * the van has not yet worked a stop. See `VanRouteService`.
 */
const DEPOT: GeoPoint = { lat: 29.9553, lng: 30.9187 };

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
 *       &$expand=Customer($select=CustomerAccount,OrganizationName,CreditLimit,
 *                          AddressDescription,Latitude,Longitude,...)
 *       &cross-company=true
 *
 * Until those ship, `loadToday` returns a representative seed so the whole van
 * cycle is exercisable end-to-end. The coordinates and addresses in it are
 * placeholder Giza geography, not customer data: they are there so route
 * ordering can be exercised and seen to work, and every one of them is replaced
 * the moment `GPRouteCustomerEntity` returns real `Latitude`/`Longitude`. Swap the body of `fetchToday` for the two
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
      depot: DEPOT,
      open: true,
      visits: [
        {
          id: 1, account: 'CU-004501', name: 'Al Noor Supermarket',
          eta: '8:15', window: '8–11', mode: 'credit', balance: 0, limit: 20000,
          status: 'done', outcome: 'Sold + collected', checkedIn: true,
          address: '12 Ahmed Orabi St, Mohandessin, Giza',
          geo: { lat: 30.0553, lng: 31.2015 },
        },
        {
          id: 2, account: 'CU-004508', name: 'Al Salam Grocery',
          eta: '9:05', window: '8–12', mode: 'credit', balance: 2400, limit: 15000,
          status: 'done', outcome: 'Collected', checkedIn: true,
          address: '45 Tahrir St, Dokki, Giza',
          geo: { lat: 30.0384, lng: 31.2119 },
        },
        {
          id: 3, account: 'CU-004512', name: 'Al Fath Market — Faisal',
          eta: '9:50', window: '9–12', mode: 'credit', balance: 12300, limit: 30000,
          status: 'current', checkedIn: false,
          address: '88 Faisal St, Faisal, Giza',
          geo: { lat: 30.0128, lng: 31.1834 },
        },
        {
          id: 4, account: 'CU-004515', name: 'Abu Omar Grocery',
          eta: '10:35', window: '', mode: 'cod', balance: 0, limit: 0,
          status: 'pending', checkedIn: false, priority: true,
          address: '3 Al Nil St, Agouza, Giza',
          geo: { lat: 30.0577, lng: 31.2043 },
        },
        {
          id: 5, account: 'CU-004520', name: 'Al Osra Hyper',
          eta: '11:10', window: '10–14', mode: 'credit', balance: 5600, limit: 25000,
          status: 'pending', checkedIn: false,
          address: 'Mall of Arabia, 6th of October City, Giza',
          geo: { lat: 29.9760, lng: 30.9432 },
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
