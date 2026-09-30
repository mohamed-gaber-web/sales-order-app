import { Injector } from '@angular/core';
import { of, throwError } from 'rxjs';
import { MENU_GROUPS } from '../../app-menu';
import { ApiService } from '../../core/services/api.service';
import { PurchaseOrderService } from '../../core/services/purchase-order.service';
import { findDashboard, MODULE_DASHBOARDS } from './module-dashboard.definitions';
import { createLiveContext, PAGE_SIZE, Row, TREND_HOURS, windowFor } from './module-dashboard.live';
import { DashboardData } from './module-dashboard.models';

const TODAY = '2026-09-30';

/** The spec build targets a library without Array.prototype.flatMap. */
function flat<T, U>(list: readonly T[], fn: (t: T) => U[]): U[] {
  return list.reduce<U[]>((all, t) => all.concat(fn(t)), []);
}

type Call = { entity: string; params: Record<string, string> };

/** A fake D365: canned rows per entity, a `$count` per entity, and a log of every call. */
function fakeApi(rows: Record<string, Row[]>, counts: Record<string, number> = {}, failing: string[] = []) {
  const calls: Call[] = [];
  const api = {
    get: (entity: string, params: Record<string, string>) => {
      calls.push({ entity, params });
      if (failing.includes(entity)) return throwError(() => new Error('entity not found'));
      if (params['$count'] === 'true' && params['$top'] === '0') return of({ value: [], '@odata.count': counts[entity] ?? 0 });
      const skip = Number(params['$skip'] ?? 0);
      return of({ value: (rows[entity] ?? []).slice(skip, skip + PAGE_SIZE) });
    },
  } as unknown as ApiService;
  return { api, calls };
}

function injectorWith(poHeaders: Row[] = []): Injector {
  return Injector.create({
    providers: [{ provide: PurchaseOrderService, useValue: { getAllOpenOrdersWithLines: () => of({ value: poHeaders }) } }],
  });
}

function numbers(d: DashboardData): number[] {
  return [
    d.hero.value,
    ...d.kpis.map((k) => k.value),
    ...(d.trend?.current.map((t) => t.value) ?? []),
    ...flat(d.breakdowns, (b) => b.rows.map((r) => r.value)),
    ...(d.pipeline?.steps.map((s) => s.count) ?? []),
  ];
}

describe('module dashboards (live)', () => {
  it('has a dashboard behind every Dashboard link in the menu', () => {
    const linked = flat(MENU_GROUPS, (g) => g.items)
      .map((i) => i.url ?? '')
      .filter((u) => u.startsWith('/module-dashboard/'))
      .map((u) => u.split('/')[2]);
    expect(linked.length).toBe(MODULE_DASHBOARDS.length);
    for (const key of linked) expect(findDashboard(key)).withContext(key).toBeDefined();
  });

  it('builds half-open windows of the right length, the previous one ending where the current starts', () => {
    const cur = windowFor(TODAY, 7);
    const prev = windowFor(TODAY, 7, 7);
    expect(cur.days.length).toBe(7);
    expect(cur.days[6]).toBe(TODAY);
    expect(prev.toIso).toBe(cur.fromIso);
  });

  for (const def of MODULE_DASHBOARDS) {
    it(`${def.moduleKey}: loads from an empty D365 without errors and explains every figure`, async () => {
      const { api } = fakeApi({});
      const ctx = createLiveContext(api, injectorWith(), 'usmf', '7D', TODAY);
      const data = await def.load(ctx);
      expect(data.kpis.length).toBe(4);
      expect(numbers(data).every((n) => Number.isFinite(n))).toBeTrue();
      expect(def.intro.length).toBeGreaterThan(40);
      expect(def.sources.length).toBeGreaterThan(0);
      for (const k of [data.hero, ...data.kpis]) expect(k.explain.length).withContext(k.key).toBeGreaterThan(15);
      for (const b of data.breakdowns) expect(b.explain.length).withContext(b.key).toBeGreaterThan(15);
      if (data.trend) expect(data.trend.previous.length).toBe(data.trend.current.length);
    });
  }

  it('sales order: counts orders, values them from their lines, and compares with last period', async () => {
    const at = (day: string) => `${day}T09:30:00Z`;
    const orders = [
      { SalesOrderNumber: 'SO-1', OrderingCustomerAccountNumber: 'C1', SalesOrderName: 'Al Noor', OrderCreationDateTime: at('2026-09-29'), SalesOrderStatus: 'Backorder', SalesOrderLines: [{ LineAmount: 100 }, { LineAmount: 50 }] },
      { SalesOrderNumber: 'SO-2', OrderingCustomerAccountNumber: 'C2', SalesOrderName: 'Al Osra', OrderCreationDateTime: at('2026-09-30'), SalesOrderStatus: 'Delivered', SalesOrderLines: [{ LineAmount: 250 }] },
    ];
    const { api, calls } = fakeApi({ '/data/SalesOrderHeadersV3': orders }, { '/data/GP_SalesHeaderAndLineData': 3 });
    const data = await findDashboard('sales-order')!.load(createLiveContext(api, injectorWith(), 'usmf', '7D', TODAY));

    expect(data.hero.key).toBe('value');
    expect(data.hero.value).toBe(400);
    expect(data.kpis.find((k) => k.key === 'orders')!.value).toBe(2);
    expect(data.kpis.find((k) => k.key === 'avg')!.value).toBe(200);
    expect(data.kpis.find((k) => k.key === 'backorder')!.previous).toBeNull();
    expect(data.pipeline!.steps.find((s) => s.label === 'Delivered')!.count).toBe(1);

    // Scoped to the company and to the period by creation time — the one date filter proven on this entity.
    const first = calls.find((c) => c.entity === '/data/SalesOrderHeadersV3')!;
    expect(first.params['$filter']).toContain("dataAreaId eq 'usmf'");
    expect(first.params['$filter']).toContain('OrderCreationDateTime ge');
  });

  it('sales order: falls back to counting orders when the environment refuses the lines expand', async () => {
    const calls: Call[] = [];
    const api = {
      get: (entity: string, params: Record<string, string>) => {
        calls.push({ entity, params });
        if (params['$expand']) return throwError(() => new Error('expand not supported'));
        if (params['$top'] === '0') return of({ value: [], '@odata.count': 0 });
        return of({ value: [{ SalesOrderNumber: 'SO-1', OrderCreationDateTime: '2026-09-30T08:00:00Z', SalesOrderStatus: 'Backorder' }] });
      },
    } as unknown as ApiService;
    const ctx = createLiveContext(api, injectorWith(), 'usmf', 'TODAY', TODAY);
    const data = await findDashboard('sales-order')!.load(ctx);
    expect(data.hero.key).toBe('orders');
    expect(data.hero.value).toBe(1);
    expect(ctx.notes.some((n) => n.includes('Order value is not shown'))).toBeTrue();
    expect(data.trend!.current.length).toBe(TREND_HOURS.length);
  });

  it('inquiry: adds on-hand across warehouses and finds items with nothing available', async () => {
    const { api } = fakeApi({
      '/data/WarehousesOnHandV2': [
        { ItemNumber: 'A', ProductName: 'Oil', InventoryWarehouseId: 'W1', OnHandQuantity: 10, AvailableOnHandQuantity: 6, ReservedOnHandQuantity: 4, OnOrderQuantity: 5 },
        { ItemNumber: 'A', ProductName: 'Oil', InventoryWarehouseId: 'W2', OnHandQuantity: 3, AvailableOnHandQuantity: 3, ReservedOnHandQuantity: 0, OnOrderQuantity: 0 },
        { ItemNumber: 'B', ProductName: 'Rice', InventoryWarehouseId: 'W1', OnHandQuantity: 2, AvailableOnHandQuantity: 0, ReservedOnHandQuantity: 2, OnOrderQuantity: 0 },
      ],
    });
    const data = await findDashboard('inquiry')!.load(createLiveContext(api, injectorWith(), 'usmf', '7D', TODAY));
    expect(data.snapshot).toBeTrue();
    expect(data.hero.value).toBe(9);
    expect(data.kpis.find((k) => k.key === 'out')!.value).toBe(1);
    expect(data.kpis.find((k) => k.key === 'reserved')!.value).toBe(6);
  });

  it('purchase order: values open lines and splits POs by delivery date', async () => {
    const past = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const soon = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const { api } = fakeApi({});
    const data = await findDashboard('purchase-order')!.load(
      createLiveContext(api, injectorWith([
        { PurchaseOrderNumber: 'P1', OrderVendorAccountNumber: 'V1', RequestedDeliveryDate: past, PurchaseOrderLinesV2: [{ LineAmount: 500, ReceivingWarehouseId: 'W1' }] },
        { PurchaseOrderNumber: 'P2', OrderVendorAccountNumber: 'V2', RequestedDeliveryDate: soon, PurchaseOrderLinesV2: [{ PurchaseQuantity: 2, PurchasePrice: 50, ReceivingWarehouseId: 'W2' }] },
        { PurchaseOrderNumber: 'P3', OrderVendorAccountNumber: 'V1', RequestedDeliveryDate: '1900-01-01T12:00:00Z', PurchaseOrderLinesV2: [] },
      ]), 'usmf', '7D', TODAY)
    );
    expect(data.hero.value).toBe(600);
    expect(data.kpis.find((k) => k.key === 'overdue')!.value).toBe(1);
    expect(data.kpis.find((k) => k.key === 'week')!.value).toBe(1);
  });

  it('keeps the rest of the page when one query fails, and says which', async () => {
    const { api } = fakeApi({}, {}, ['/data/ProductionPickingListJournalEntries']);
    const ctx = createLiveContext(api, injectorWith(), 'usmf', '7D', TODAY);
    const data = await findDashboard('production')!.load(ctx);
    expect(data.hero).toBeDefined();
    expect(ctx.notes.some((n) => n.includes('Picking list lines'))).toBeTrue();
  });

  it('pages through large tables with $top/$skip and stops at the cap with a note', async () => {
    const many = Array.from({ length: PAGE_SIZE * 2 + 5 }, (_, i) => ({ ItemNumber: `I${i}`, OnHandQuantity: 1, AvailableOnHandQuantity: 1 }));
    const { api, calls } = fakeApi({ '/data/WarehousesOnHandV2': many });
    const data = await findDashboard('inquiry')!.load(createLiveContext(api, injectorWith(), 'usmf', '7D', TODAY));
    expect(data.hero.value).toBe(many.length);
    expect(calls.filter((c) => c.entity === '/data/WarehousesOnHandV2').length).toBe(3);
  });
});
