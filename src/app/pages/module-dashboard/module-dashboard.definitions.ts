import { firstValueFrom } from 'rxjs';
import { PurchaseOrderService } from '../../core/services/purchase-order.service';
import { BarRow } from '../../shared/charts';
import { hasDate, inWindow, LiveContext, num, Row, str } from './module-dashboard.live';
import { AttentionItem, DashboardData, Metric, ModuleDashboardDef } from './module-dashboard.models';

/**
 * One dashboard per module in the menu, read live from D365.
 *
 * Every query here uses only entities, fields and filters the app's own
 * screens already use against this environment (see the entity map in the
 * services under `core/services`). Where a module has no dated history the
 * app can read, its figures are a snapshot of right now and say so, rather
 * than inventing a comparison.
 *
 * The words matter as much as the numbers: each figure explains what it
 * means and how it is worked out, so a new user can learn the module here.
 */

const ENUM = 'Microsoft.Dynamics.DataEntities';

function m(
  key: string,
  label: string,
  icon: string,
  format: Metric['format'],
  value: number,
  previous: number | null,
  upIsGood: boolean,
  explain: string
): Metric {
  return { key, label, icon, format, value: round(value), previous: previous === null ? null : round(previous), upIsGood, explain };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function sum(rows: Row[], field: string | ((r: Row) => number)): number {
  const f = typeof field === 'string' ? (r: Row) => num(r[field]) : field;
  return round(rows.reduce((s, r) => s + f(r), 0));
}

function distinct(rows: Row[], field: string): number {
  return new Set(rows.map((r) => str(r[field])).filter(Boolean)).size;
}

function share(rows: BarRow[]): string {
  const total = rows.reduce((s, r) => s + r.value, 0);
  const top = rows[0];
  return top && total > 0 ? `${top.label} is ${Math.round((top.value / total) * 100)}% of the total.` : '';
}

/** Counts rows per value of a status field, in a fixed order, with anything else as "Other". */
function byStatus(rows: Row[], field: string, order: { key: string; label: string; icon: string; match: string[] }[]) {
  const steps = order.map((o) => ({
    label: o.label,
    icon: o.icon,
    count: rows.filter((r) => o.match.includes(str(r[field]))).length,
  }));
  const known = new Set(order.reduce<string[]>((all, o) => all.concat(o.match), []));
  const other = rows.filter((r) => !known.has(str(r[field]))).length;
  return other ? [...steps, { label: 'Other', icon: 'ellipsis-horizontal', count: other }] : steps;
}

// ── Sales order ────────────────────────────────────────────────────────────

const salesOrder: ModuleDashboardDef = {
  moduleKey: 'sales-order',
  title: 'Sales order',
  icon: 'cart',
  intro:
    'Sales orders are what customers have asked to buy. This module confirms them, ships them with a packing slip, and reserves stock so it is not promised twice.',
  audience: 'Sales administrators, warehouse dispatch, and the sales manager.',
  heroCaption: 'Sales orders created in the period, by their creation time in D365.',
  sources: ['sales order headers and lines', 'open order lines'],
  glossary: [
    { term: 'Sales order', meaning: 'A customer’s request to buy items at agreed prices. It becomes revenue once invoiced.' },
    { term: 'Packing slip', meaning: 'The D365 document that records goods leaving the warehouse for an order. Posting it reduces stock on hand.' },
    { term: 'Open order', meaning: 'An order still being worked — D365 calls this status “Backorder”, even when nothing is late.' },
    { term: 'Awaiting shipment', meaning: 'Confirmed order lines with quantity still to ship.' },
    { term: 'Order value', meaning: 'The sum of the order lines’ net amounts, before tax.' },
  ],
  async load(ctx) {
    const co = ctx.company;
    const entity = '/data/SalesOrderHeadersV3';
    const select = 'SalesOrderNumber,OrderingCustomerAccountNumber,SalesOrderName,OrderCreationDateTime,SalesOrderStatus';
    const params = (w: typeof ctx.current) => ({
      $filter: `dataAreaId eq '${co}' and ${ctx.within('OrderCreationDateTime', w)}`,
      $select: select,
      $orderby: 'OrderCreationDateTime asc',
    });
    // Order value needs the lines. If this environment refuses the expand,
    // fall back to counting orders and say so.
    let valued = true;
    const fetch = async (w: typeof ctx.current): Promise<Row[]> => {
      if (valued) {
        try {
          return await ctx.rows(entity, { ...params(w), $expand: 'SalesOrderLines($select=LineAmount)' });
        } catch {
          valued = false;
          ctx.notes.push('Order value is not shown: this environment would not return order lines with the headers.');
        }
      }
      return ctx.rows(entity, params(w));
    };
    const cur = await fetch(ctx.current);
    const prev = await ctx.safe('Last period’s orders', () => fetch(ctx.previous), [] as Row[]);
    const value = (r: Row) => sum((r['SalesOrderLines'] as Row[]) ?? [], 'LineAmount');

    const lineEntity = '/data/GP_SalesHeaderAndLineData';
    const openStatus = `SalesTable_SalesStatus eq ${ENUM}.SalesStatus'Backorder' and SalesStatus eq ${ENUM}.SalesStatus'Backorder'`;
    const [backorder, awaiting] = await Promise.all([
      ctx.safe('Open order lines', () => ctx.count(lineEntity, `dataAreaId eq '${co}' and RemainInventPhysical gt 0 and ${openStatus}`), 0),
      ctx.safe(
        'Lines awaiting shipment',
        () => ctx.count(lineEntity, `dataAreaId eq '${co}' and SalesOrderProcessingStatus eq ${ENUM}.SalesOrderProcessingStatus'Confirmed' and RemainInventPhysical gt 0`),
        0
      ),
    ]);

    const orders = m('orders', 'Orders created', 'document-text', 'number', cur.length, prev.length, true, 'New sales orders entered in D365 in the period, from any channel.');
    const valueM = m('value', 'Order value', 'cart', 'money', sum(cur, value), sum(prev, value), true, 'Net value of the order lines on orders created in the period, before tax.');
    const avg = m(
      'avg', 'Avg order value', 'calculator', 'money',
      cur.length ? sum(cur, value) / cur.length : 0,
      prev.length ? sum(prev, value) / prev.length : 0,
      true, 'Order value divided by orders created. A falling average means smaller baskets.'
    );
    const customers = m('customers', 'Customers ordering', 'people', 'number', distinct(cur, 'OrderingCustomerAccountNumber'), distinct(prev, 'OrderingCustomerAccountNumber'), true, 'Different customer accounts that placed an order in the period.');
    const bo = m('backorder', 'Open order lines', 'hourglass', 'number', backorder, null, false, 'Order lines with quantity still to deliver right now, across all dates.');
    const aw = m('awaiting', 'Awaiting shipment', 'archive', 'number', awaiting, null, false, 'Confirmed order lines with quantity still to ship right now — the dispatch queue.');

    const label = (k: string) => cur.find((r) => str(r['OrderingCustomerAccountNumber']) === k)?.['SalesOrderName'] as string || k;
    const topCustomers = ctx.top(cur, (r) => str(r['OrderingCustomerAccountNumber']), (r) => (valued ? value(r) : 1), 6, (k) => str(label(k)));

    const attention: AttentionItem[] = [];
    if (awaiting > 0) attention.push({ tone: 'warning', text: `${awaiting} confirmed order lines are waiting to ship.` });
    if (backorder > 0) attention.push({ tone: 'neutral', text: `${backorder} order lines are still open in D365.` });

    return {
      hero: valued ? valueM : orders,
      kpis: valued ? [orders, avg, bo, aw] : [customers, bo, aw, m('avgLines', 'Orders per customer', 'people', 'number', customers.value ? cur.length / customers.value : 0, customers.previous ? prev.length / customers.previous : 0, true, 'Orders created divided by the customers who ordered.')],
      trend: {
        title: valued ? 'Order value' : 'Orders created',
        explain: valued ? 'Value of orders created per day (per hour today).' : 'Orders created per day (per hour today).',
        format: valued ? 'money' : 'number',
        ...ctx.trend(cur, prev, 'OrderCreationDateTime', (r) => (valued ? value(r) : 1)),
      },
      pipeline: {
        title: 'Status of this period’s orders',
        explain: 'Where the orders created in the period are now. “Open” is still being worked, “Delivered” has a packing slip, “Invoiced” is billed.',
        steps: byStatus(cur, 'SalesOrderStatus', [
          { key: 'open', label: 'Open', icon: 'create', match: ['Backorder', 'None'] },
          { key: 'delivered', label: 'Delivered', icon: 'archive', match: ['Delivered'] },
          { key: 'invoiced', label: 'Invoiced', icon: 'receipt', match: ['Invoiced'] },
          { key: 'canceled', label: 'Canceled', icon: 'close-circle', match: ['Canceled'] },
        ]),
      },
      breakdowns: [
        {
          key: 'customers',
          title: valued ? 'Top customers by order value' : 'Top customers by orders',
          explain: 'Who ordered most in the period. Depending on one or two customers is a risk worth watching.',
          kind: 'bars',
          format: valued ? 'money' : 'number',
          rows: topCustomers,
          insight: share(topCustomers),
        },
      ],
      attention,
    };
  },
};

// ── Return order ───────────────────────────────────────────────────────────

const returnOrder: ModuleDashboardDef = {
  moduleKey: 'return-order',
  title: 'Return order',
  icon: 'arrow-undo',
  intro:
    'Return orders cover goods customers send back. The returns desk receives them against the picking slip, and D365 then credits the customer.',
  audience: 'Customer service, the returns desk, and quality control.',
  heroCaption: 'Return order lines still waiting to be received, right now.',
  sources: ['open return order lines'],
  glossary: [
    { term: 'Return order', meaning: 'A sales order of type “Returned item” — the customer is sending goods back.' },
    { term: 'Picking slip', meaning: 'Here, the list the returns desk works from to receive returned goods.' },
    { term: 'Units to receive', meaning: 'Quantity on open return lines that has not arrived yet.' },
    { term: 'Credit note', meaning: 'The document that refunds or credits the customer once the return is received.' },
  ],
  async load(ctx) {
    const co = ctx.company;
    const rows = await ctx.rows('/data/GP_SalesHeaderAndLineData', {
      $filter:
        `dataAreaId eq '${co}' and (SalesType eq ${ENUM}.SalesType'ReturnItem' or RemainInventPhysical lt 0) ` +
        `and SalesTable_SalesStatus eq ${ENUM}.SalesStatus'Backorder' and SalesStatus eq ${ENUM}.SalesStatus'Backorder'`,
      $select: 'SalesId,CustAccount,SalesTable_SalesName,RemainInventPhysical',
    });
    const units = (r: Row) => Math.abs(num(r['RemainInventPhysical']));
    const names = new Map(rows.map((r) => [str(r['CustAccount']), str(r['SalesTable_SalesName']) || str(r['CustAccount'])]));
    const byCustomer = ctx.top(rows, (r) => str(r['CustAccount']), units, 6, (k) => names.get(k) ?? k);
    const byOrder = ctx.top(rows, (r) => str(r['SalesId']), units, 6);
    const orders = distinct(rows, 'SalesId');
    return {
      snapshot: true,
      hero: m('lines', 'Open return lines', 'arrow-undo', 'number', rows.length, null, false, 'Return order lines not yet received at the warehouse.'),
      kpis: [
        m('orders', 'Open return orders', 'document-text', 'number', orders, null, false, 'Return orders with at least one line still to receive.'),
        m('units', 'Units to receive', 'cube', 'number', sum(rows, units), null, false, 'Total quantity customers are due to send back on open returns.'),
        m('customers', 'Customers returning', 'people', 'number', distinct(rows, 'CustAccount'), null, false, 'Different customers with an open return.'),
        m('perOrder', 'Lines per return', 'list', 'number', orders ? rows.length / orders : 0, null, false, 'Average lines on each open return. Many lines per return often means a whole delivery came back.'),
      ],
      breakdowns: [
        { key: 'customers', title: 'Units to receive by customer', explain: 'Who is sending the most back. A customer high on this list may have a handling or ordering problem.', kind: 'bars', format: 'number', rows: byCustomer, insight: share(byCustomer) },
        { key: 'orders', title: 'Largest open returns', explain: 'The return orders with the most units still to arrive — the ones to plan space for.', kind: 'bars', format: 'number', rows: byOrder },
      ],
      attention: orders ? [{ tone: 'neutral', text: `${orders} return orders are waiting to be received.` }] : [],
    };
  },
};

// ── Purchase order ─────────────────────────────────────────────────────────

const purchaseOrder: ModuleDashboardDef = {
  moduleKey: 'purchase-order',
  title: 'Purchase order',
  icon: 'cube',
  intro:
    'Purchase orders are what you have bought from vendors. This module receives the goods against them — by list, barcode or a scanned paper PO — and returns faulty goods.',
  audience: 'Receiving clerks, buyers, and the procurement manager.',
  heroCaption: 'Value of goods still to arrive on confirmed, open purchase orders, right now.',
  sources: ['open purchase orders and their lines'],
  glossary: [
    { term: 'Purchase order (PO)', meaning: 'Your order to a vendor: what you will buy, how much, at what price, and by when.' },
    { term: 'Confirmed', meaning: 'The PO has been approved and sent, so the vendor is expected to deliver.' },
    { term: 'Open', meaning: 'D365 status “Backorder”: goods on the PO have not all arrived.' },
    { term: 'Product receipt', meaning: 'The document that records goods arriving. Posting it raises stock on hand.' },
    { term: 'Overdue', meaning: 'An open PO whose requested delivery date has already passed.' },
  ],
  async load(ctx) {
    const res = await firstValueFrom(ctx.get(PurchaseOrderService).getAllOpenOrdersWithLines());
    const headers = (res.value ?? []) as unknown as Row[];
    const lines: Row[] = [];
    for (const h of headers) for (const l of (h['PurchaseOrderLinesV2'] as Row[]) ?? []) lines.push({ ...l, _vendor: h['OrderVendorAccountNumber'] ?? h['VendorAccountNumber'] });
    const lineValue = (l: Row) => num(l['LineAmount']) || num(l['PurchaseQuantity']) * num(l['PurchasePrice']);
    const headerValue = (h: Row) => sum((h['PurchaseOrderLinesV2'] as Row[]) ?? [], lineValue);

    const now = Date.now();
    const weekAhead = now + 7 * 86_400_000;
    const due = (h: Row) => (hasDate(h['RequestedDeliveryDate']) ? Date.parse(str(h['RequestedDeliveryDate'])) : null);
    const overdue = headers.filter((h) => (due(h) ?? Infinity) < now);
    const thisWeek = headers.filter((h) => {
      const d = due(h);
      return d !== null && d >= now && d <= weekAhead;
    });
    const later = headers.filter((h) => !overdue.includes(h) && !thisWeek.includes(h));

    const byVendor = ctx.top(headers, (h) => str(h['OrderVendorAccountNumber'] ?? h['VendorAccountNumber']), headerValue);
    const byWarehouse = ctx.top(lines, (l) => str(l['ReceivingWarehouseId']), lineValue);
    return {
      snapshot: true,
      hero: m('open', 'Open PO value', 'cube', 'money', sum(headers, headerValue), null, true, 'Value of lines on confirmed purchase orders that have not been fully received.'),
      kpis: [
        m('pos', 'Open POs', 'folder-open', 'number', headers.length, null, false, 'Confirmed purchase orders still waiting for goods.'),
        m('lines', 'Open lines', 'list', 'number', lines.length, null, false, 'Lines on those orders — each one is a receipt still to post.'),
        m('overdue', 'Overdue POs', 'alarm', 'number', overdue.length, null, false, 'Open POs past their requested delivery date. Chase these vendors.'),
        m('week', 'Due in 7 days', 'calendar', 'number', thisWeek.length, null, true, 'Open POs expected within the next seven days — plan receiving space for them.'),
      ],
      breakdowns: [
        {
          key: 'timing', title: 'Delivery timing', kind: 'split', format: 'number',
          rows: [
            { key: 'overdue', label: 'Overdue', value: overdue.length },
            { key: 'week', label: 'Due in 7 days', value: thisWeek.length },
            { key: 'later', label: 'Later or no date', value: later.length },
          ],
          explain: 'Open purchase orders by their requested delivery date.',
        },
        { key: 'vendors', title: 'Open value by vendor', kind: 'bars', format: 'money', rows: byVendor, insight: share(byVendor), explain: 'Which vendors you are waiting on most. Pair it with the overdue count to see who is reliable.' },
        { key: 'warehouses', title: 'Open value by receiving warehouse', kind: 'bars', format: 'money', rows: byWarehouse, explain: 'Where the goods are going — so each warehouse knows what to expect.' },
      ],
      attention: overdue.length ? [{ tone: 'warning', text: `${overdue.length} purchase orders are past their delivery date.` }] : [],
    };
  },
};

// ── On-hand, shared by Inventory, Inquiry and Warehouse ────────────────────

async function onHand(ctx: LiveContext): Promise<Row[]> {
  return ctx.rows('/data/WarehousesOnHandV2', {
    $select: 'ItemNumber,ProductName,InventoryWarehouseId,OnHandQuantity,AvailableOnHandQuantity,ReservedOnHandQuantity,OnOrderQuantity',
    $orderby: 'ItemNumber asc',
  });
}

function itemTotals(rows: Row[]): Map<string, { name: string; onHand: number; available: number }> {
  const map = new Map<string, { name: string; onHand: number; available: number }>();
  for (const r of rows) {
    const k = str(r['ItemNumber']);
    const cur = map.get(k) ?? { name: str(r['ProductName']) || k, onHand: 0, available: 0 };
    cur.onHand += num(r['OnHandQuantity']);
    cur.available += num(r['AvailableOnHandQuantity']);
    map.set(k, cur);
  }
  return map;
}

function transferCount(ctx: LiveContext, status: string): Promise<number> {
  return ctx.safe(`${status} transfer orders`, () => ctx.count('/data/TransferOrderHeaders', `TransferOrderStatus eq ${ENUM}.InventTransferStatus'${status}'`), 0);
}

// ── Inventory ──────────────────────────────────────────────────────────────

const inventory: ModuleDashboardDef = {
  moduleKey: 'inventory',
  title: 'Inventory',
  icon: 'layers',
  intro:
    'Inventory tracks what stock you hold, where it is, and how it moves between warehouses. Transfer orders, cycle counts and transfer journals keep the on-hand figure honest.',
  audience: 'Storekeepers, inventory controllers, and the supply chain manager.',
  heroCaption: 'Units physically on hand across all warehouses, right now.',
  sources: ['on-hand by warehouse', 'transfer orders', 'counting journals'],
  glossary: [
    { term: 'On hand', meaning: 'Quantity physically in a warehouse right now, according to D365.' },
    { term: 'Transfer order', meaning: 'Moves stock between warehouses: created, shipped from one side, received on the other.' },
    { term: 'In transit', meaning: 'Transfer orders shipped but not yet received — stock that cannot be sold meanwhile.' },
    { term: 'Counting journal', meaning: 'A cycle count in progress. Posting it corrects on-hand to what was counted.' },
  ],
  async load(ctx) {
    const [stock, created, shipped, received, counting] = await Promise.all([
      onHand(ctx),
      transferCount(ctx, 'Created'),
      transferCount(ctx, 'Shipped'),
      transferCount(ctx, 'Received'),
      ctx.safe(
        'Open counting journals',
        () => ctx.count('/data/InventoryCountingJournalHeaders', `dataAreaId eq '${ctx.company}' and IsPosted eq ${ENUM}.NoYes'No'`, { 'cross-company': 'true' }),
        0
      ),
    ]);
    const items = itemTotals(stock);
    const stocked = [...items.values()].filter((i) => i.onHand > 0).length;
    const byWarehouse = ctx.top(stock, (r) => str(r['InventoryWarehouseId']), (r) => num(r['OnHandQuantity']));
    const topItems = [...items]
      .map(([k, v]) => ({ key: k, label: v.name, value: round(v.onHand) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
    return {
      snapshot: true,
      hero: m('onhand', 'Units on hand', 'layers', 'number', sum(stock, 'OnHandQuantity'), null, true, 'Physical quantity of every item in every warehouse, added together.'),
      kpis: [
        m('items', 'Items in stock', 'pricetags', 'number', stocked, null, true, 'Different items with any quantity on hand.'),
        m('warehouses', 'Warehouses with stock', 'business', 'number', new Set(stock.filter((r) => num(r['OnHandQuantity']) > 0).map((r) => str(r['InventoryWarehouseId']))).size, null, true, 'Warehouses holding at least one unit.'),
        m('transit', 'In transit', 'car', 'number', shipped, null, false, 'Transfer orders shipped but not yet received.'),
        m('counting', 'Open counts', 'refresh-circle', 'number', counting, null, false, 'Counting journals started but not posted. Post them so on-hand is corrected.'),
      ],
      pipeline: {
        title: 'Transfer orders',
        explain: 'A transfer is created, shipped from the source warehouse, then received at the destination. “Received” counts every transfer ever completed.',
        steps: [
          { label: 'Created', icon: 'create', count: created },
          { label: 'Shipped', icon: 'car', count: shipped },
          { label: 'Received', icon: 'download', count: received },
        ],
      },
      breakdowns: [
        { key: 'warehouses', title: 'Units on hand by warehouse', kind: 'bars', format: 'number', rows: byWarehouse, insight: share(byWarehouse), explain: 'Where the stock sits. A warehouse with a lot on hand and few movements holds slow stock.' },
        { key: 'items', title: 'Items with most on hand', kind: 'bars', format: 'number', rows: topItems, explain: 'The items taking up the most units. Check they are also the ones selling.' },
      ],
      attention: [
        ...(shipped ? [{ tone: 'warning' as const, text: `${shipped} transfer orders are in transit — receive them so the stock can be sold.` }] : []),
        ...(counting ? [{ tone: 'neutral' as const, text: `${counting} counting journals are open and not posted.` }] : []),
      ],
    };
  },
};

// ── Inquiry ────────────────────────────────────────────────────────────────

const inquiry: ModuleDashboardDef = {
  moduleKey: 'inquiry',
  title: 'Inquiry',
  icon: 'search',
  intro:
    'Inquiry answers “how much do we have, and where?” without changing anything. It reads on-hand stock straight from D365.',
  audience: 'Anyone who needs a stock answer: sales, buyers, and the warehouse.',
  heroCaption: 'Units free to promise to a new order, across all warehouses, right now.',
  sources: ['on-hand by warehouse'],
  glossary: [
    { term: 'On hand', meaning: 'Everything physically in the warehouse, including stock already promised.' },
    { term: 'Available', meaning: 'On hand minus reserved — what can still be promised to a new order.' },
    { term: 'Reserved', meaning: 'Stock set aside for existing orders.' },
    { term: 'On order', meaning: 'Quantity on purchase or production orders that has not arrived yet.' },
    { term: 'Out of stock', meaning: 'An item with nothing available in any warehouse.' },
  ],
  async load(ctx) {
    const stock = await onHand(ctx);
    const items = itemTotals(stock);
    const out = [...items.values()].filter((i) => i.available <= 0).length;
    const available = sum(stock, 'AvailableOnHandQuantity');
    const reserved = sum(stock, 'ReservedOnHandQuantity');
    const onOrder = sum(stock, 'OnOrderQuantity');
    const byWarehouse = ctx.top(stock, (r) => str(r['InventoryWarehouseId']), (r) => num(r['AvailableOnHandQuantity']));
    const lowest = [...items]
      .filter(([, v]) => v.onHand > 0)
      .map(([k, v]) => ({ key: k, label: v.name, value: round(Math.max(0, v.available)) }))
      .sort((a, b) => a.value - b.value)
      .slice(0, 6);
    return {
      snapshot: true,
      hero: m('available', 'Units available', 'cube', 'number', available, null, true, 'On hand minus reserved, across all warehouses — what sales can still promise.'),
      kpis: [
        m('reserved', 'Reserved', 'bookmark', 'number', reserved, null, true, 'Units already promised to orders.'),
        m('onorder', 'On order', 'time', 'number', onOrder, null, true, 'Units on purchase or production orders, still to arrive.'),
        m('items', 'Items tracked', 'pricetags', 'number', items.size, null, true, 'Different items with an on-hand record.'),
        m('out', 'Out of stock', 'close-circle', 'number', out, null, false, 'Items with nothing available anywhere. Each one is a lost sale waiting to happen.'),
      ],
      breakdowns: [
        {
          key: 'status', title: 'Stock status', kind: 'split', format: 'number',
          rows: [
            { key: 'available', label: 'Available', value: available },
            { key: 'reserved', label: 'Reserved', value: reserved },
            { key: 'onorder', label: 'On order', value: onOrder },
          ],
          explain: 'How stock splits between free to promise, already promised, and still to arrive.',
        },
        { key: 'warehouses', title: 'Available by warehouse', kind: 'bars', format: 'number', rows: byWarehouse, insight: share(byWarehouse), explain: 'Where the free stock is, so an order can ship from the right place.' },
        { key: 'lowest', title: 'Items closest to running out', kind: 'bars', format: 'number', rows: lowest, explain: 'Stocked items with the least available. Reorder before they reach zero.' },
      ],
      attention: out ? [{ tone: 'critical', text: `${out} items have nothing available to sell.` }] : [],
    };
  },
};

// ── Warehouse ──────────────────────────────────────────────────────────────

const warehouse: ModuleDashboardDef = {
  moduleKey: 'warehouse',
  title: 'Warehouse management',
  icon: 'business',
  intro:
    'Warehouse management runs the work inside the building: where stock sits, what is moving in and out, and — through license plates, pick, put and packing — how it is handled.',
  audience: 'Warehouse operators, shift leaders, and the warehouse manager.',
  heroCaption: 'Open transfer orders moving stock out of or into your warehouses, right now.',
  sources: ['warehouses', 'on-hand by warehouse', 'open transfer orders'],
  glossary: [
    { term: 'Warehouse', meaning: 'A building or area D365 holds stock in, belonging to a site.' },
    { term: 'Outbound', meaning: 'Open transfers still to ship from this warehouse.' },
    { term: 'Inbound', meaning: 'Transfers shipped to this warehouse, still to receive.' },
    { term: 'License plate', meaning: 'A barcode ID for a pallet or container. The app’s license plate, pick and packing screens are not connected to D365 yet, so their figures are not shown here.' },
  ],
  async load(ctx) {
    const [warehouses, stock, transfers] = await Promise.all([
      ctx.safe('Warehouses', () => ctx.rows('/data/Warehouses', { $select: 'WarehouseId,WarehouseName,OperationalSiteId', $orderby: 'WarehouseId asc' }), [] as Row[]),
      onHand(ctx),
      ctx.safe(
        'Open transfer orders',
        () =>
          ctx.rows('/data/TransferOrderHeaders', {
            $filter: `TransferOrderStatus ne ${ENUM}.InventTransferStatus'Received'`,
            $select: 'TransferOrderNumber,TransferOrderStatus,ShippingWarehouseId,ReceivingWarehouseId',
          }),
        [] as Row[]
      ),
    ]);
    const names = new Map(warehouses.map((w) => [str(w['WarehouseId']), str(w['WarehouseName']) || str(w['WarehouseId'])]));
    const label = (k: string) => (names.get(k) && names.get(k) !== k ? `${k} · ${names.get(k)}` : k);
    const outbound = transfers.filter((t) => str(t['TransferOrderStatus']) !== 'Shipped');
    const inbound = transfers.filter((t) => str(t['TransferOrderStatus']) === 'Shipped');
    const withStock = new Set(stock.filter((r) => num(r['OnHandQuantity']) > 0).map((r) => str(r['InventoryWarehouseId'])));
    const sites = distinct(warehouses, 'OperationalSiteId');
    return {
      snapshot: true,
      hero: m('transfers', 'Open transfers', 'swap-horizontal', 'number', transfers.length, null, false, 'Transfer orders not yet received — each one is warehouse work still to do.'),
      kpis: [
        m('outbound', 'Outbound to ship', 'arrow-up-circle', 'number', outbound.length, null, false, 'Transfers created but not shipped yet: stock to pick and send.'),
        m('inbound', 'Inbound to receive', 'arrow-down-circle', 'number', inbound.length, null, false, 'Transfers on the road to one of your warehouses: stock to receive and put away.'),
        m('warehouses', 'Warehouses', 'business', 'number', warehouses.length, null, true, `Warehouses set up in D365 across ${sites} site${sites === 1 ? '' : 's'}.`),
        m('stocked', 'Holding stock', 'layers', 'number', withStock.size, null, true, 'Warehouses with at least one unit on hand.'),
      ],
      breakdowns: [
        { key: 'onhand', title: 'Units on hand by warehouse', kind: 'bars', format: 'number', rows: ctx.top(stock, (r) => str(r['InventoryWarehouseId']), (r) => num(r['OnHandQuantity']), 6, label), explain: 'How full each warehouse is, in units.' },
        { key: 'out', title: 'Outbound work by warehouse', kind: 'bars', format: 'number', rows: ctx.top(outbound, (t) => str(t['ShippingWarehouseId']), () => 1, 6, label), explain: 'Where transfers are waiting to be picked and shipped.' },
        { key: 'in', title: 'Inbound work by warehouse', kind: 'bars', format: 'number', rows: ctx.top(inbound, (t) => str(t['ReceivingWarehouseId']), () => 1, 6, label), explain: 'Where shipped transfers will arrive and need receiving.' },
      ],
      attention: inbound.length ? [{ tone: 'warning', text: `${inbound.length} transfers are in transit to your warehouses.` }] : [],
    };
  },
};

// ── Production ─────────────────────────────────────────────────────────────

const production: ModuleDashboardDef = {
  moduleKey: 'production',
  title: 'Production',
  icon: 'construct',
  intro:
    'Production turns raw materials into finished goods. Picking lists issue the materials to an order; report as finished puts the output into stock.',
  audience: 'Production planners, shop-floor supervisors, and the plant manager.',
  heroCaption: 'Production orders that are not ended yet, right now.',
  sources: ['production orders', 'picking list journals'],
  glossary: [
    { term: 'Production order', meaning: 'An instruction to make a quantity of a product, with its materials and steps.' },
    { term: 'Released', meaning: 'Sent to the shop floor; materials can be picked.' },
    { term: 'Started', meaning: 'Work has begun on the order.' },
    { term: 'Reported as finished', meaning: 'The good quantity made has been put into stock.' },
    { term: 'Picking list', meaning: 'Issues materials from stock to an order. Its lines record consumption and scrap.' },
    { term: 'Scrap rate', meaning: 'Scrapped material as a share of all material issued on posted picking lists.' },
  ],
  async load(ctx) {
    const [orders, picks] = await Promise.all([
      ctx.rows('/data/ProductionOrderHeaders', {
        'cross-company': 'true',
        $filter: `dataAreaId eq '${ctx.company}'`,
        $select: 'ProductionOrderNumber,ItemNumber,ProductionOrderName,ProductionOrderStatus,ScheduledQuantity,StartedQuantity,RemainingReportAsFinishedQuantity',
      }),
      ctx.safe(
        'Picking list lines',
        () =>
          ctx.rows('/data/ProductionPickingListJournalEntries', {
            $select: 'JournalNumber,IsPosted,PostedDateTime,ProductionOrderNumber,ConsumptionBOMQuantity,ScrapBOMQuantity',
          }),
        [] as Row[]
      ),
    ]);
    const open = orders.filter((o) => str(o['ProductionOrderStatus']) !== 'Ended');
    const posted = picks.filter((p) => str(p['IsPosted']) === 'Yes' && hasDate(p['PostedDateTime']));
    const cur = posted.filter((p) => inWindow(p['PostedDateTime'], ctx.current));
    const prev = posted.filter((p) => inWindow(p['PostedDateTime'], ctx.previous));
    const scrap = (list: Row[]) => {
      const used = sum(list, 'ConsumptionBOMQuantity');
      const scr = sum(list, 'ScrapBOMQuantity');
      return used + scr > 0 ? (scr / (used + scr)) * 100 : 0;
    };
    const unposted = new Set(picks.filter((p) => str(p['IsPosted']) !== 'Yes').map((p) => str(p['JournalNumber']))).size;
    const remaining = sum(open, 'RemainingReportAsFinishedQuantity');
    const byItem = ctx.top(open, (o) => str(o['ItemNumber']), (o) => num(o['RemainingReportAsFinishedQuantity']), 6, (k) => {
      const o = open.find((x) => str(x['ItemNumber']) === k);
      return str(o?.['ProductionOrderName']) || k;
    });
    return {
      hero: m('open', 'Open production orders', 'construct', 'number', open.length, null, false, 'Production orders in any status except Ended.'),
      kpis: [
        m('remaining', 'Left to finish', 'hourglass', 'number', remaining, null, false, 'Quantity on open orders not yet reported as finished.'),
        m('picked', 'Picking lines posted', 'list', 'number', cur.length, prev.length, true, 'Material lines issued to orders on picking lists posted in the period.'),
        m('scrap', 'Scrap rate', 'trash', 'pct', scrap(cur), scrap(prev), false, 'Scrapped material as a share of all material issued in the period. Lower is better.'),
        m('unposted', 'Unposted picking lists', 'document', 'number', unposted, null, false, 'Picking list journals created but not posted — materials not yet issued in D365.'),
      ],
      trend: {
        title: 'Picking lines posted',
        explain: 'Material lines issued to production per day (per hour today), by the time the picking list was posted.',
        format: 'number',
        ...ctx.trend(cur, prev, 'PostedDateTime', () => 1),
      },
      pipeline: {
        title: 'Production orders by status',
        explain: 'Orders move from planned, to released on the floor, to started, to reported as finished, then ended so their cost is settled.',
        steps: byStatus(orders, 'ProductionOrderStatus', [
          { key: 'planned', label: 'Planned', icon: 'calendar', match: ['Created', 'CostEstimated', 'Estimated', 'Scheduled'] },
          { key: 'released', label: 'Released', icon: 'send', match: ['Released'] },
          { key: 'started', label: 'Started', icon: 'play', match: ['StartedUp'] },
          { key: 'reported', label: 'Finished', icon: 'checkmark-circle', match: ['ReportedFinished', 'Reported'] },
          { key: 'ended', label: 'Ended', icon: 'lock-closed', match: ['Ended'] },
        ]),
      },
      breakdowns: [
        { key: 'items', title: 'Left to finish by product', kind: 'bars', format: 'number', rows: byItem, insight: share(byItem), explain: 'What the plant still has to make on open orders.' },
      ],
      attention: unposted ? [{ tone: 'warning', text: `${unposted} picking lists are not posted, so their materials are not issued in D365.` }] : [],
    };
  },
};

// ── Project ────────────────────────────────────────────────────────────────

const project: ModuleDashboardDef = {
  moduleKey: 'project',
  title: 'Project',
  icon: 'folder-open',
  intro:
    'Projects consume items from stock — for installations, contracts or internal jobs. Item requirements say what a project needs; item journals record what it actually used.',
  audience: 'Project coordinators, site engineers, and project accountants.',
  heroCaption: 'Cost of items on project item journal lines dated in the period.',
  sources: ['projects', 'project item journals and their lines'],
  glossary: [
    { term: 'Project', meaning: 'A job items are charged to — an installation, a contract, an internal build.' },
    { term: 'Stage', meaning: 'Where the project is in its life: created, in process, finished…' },
    { term: 'Item journal', meaning: 'Records items a project consumed. Posting it charges their cost to the project.' },
    { term: 'Item cost', meaning: 'The cost amount on item journal lines, by the project date on each line.' },
  ],
  async load(ctx) {
    const co = ctx.company;
    const [projects, journals, trans] = await Promise.all([
      ctx.rows('/data/Projects', {
        'cross-company': 'true',
        $filter: `dataAreaId eq '${co}'`,
        $select: 'ProjectID,ProjectName,CustomerAccount,ProjectStage,ProjectType,ProjectGroup,StartDate1',
      }),
      ctx.safe('Project item journals', () => ctx.rows('/data/ProjectItemJournalTables', { 'cross-company': 'true', $filter: `dataAreaId eq '${co}'`, $select: 'JournalId,Posted' }), [] as Row[]),
      ctx.safe('Project item journal lines', () => ctx.rows('/data/ProjectItemJournalTrans', { 'cross-company': 'true', $filter: `dataAreaId eq '${co}'`, $select: 'JournalId,ProjectId,ItemId,Quantity,CostAmount,ProjectDate' }), [] as Row[]),
    ]);
    const cur = trans.filter((t) => inWindow(t['ProjectDate'], ctx.current));
    const prev = trans.filter((t) => inWindow(t['ProjectDate'], ctx.previous));
    const openJournals = journals.filter((j) => ['No', 'false', '0', ''].includes(str(j['Posted']))).length;
    const names = new Map(projects.map((p) => [str(p['ProjectID']), str(p['ProjectName']) || str(p['ProjectID'])]));
    const byProject = ctx.top(cur, (t) => str(t['ProjectId']), (t) => num(t['CostAmount']), 6, (k) => (names.get(k) ? `${k} · ${names.get(k)}` : k));
    const byStage = ctx.top(projects, (p) => str(p['ProjectStage']) || 'No stage', () => 1, 6);
    return {
      hero: m('cost', 'Item cost', 'folder-open', 'money', sum(cur, 'CostAmount'), sum(prev, 'CostAmount'), true, 'Cost amount on project item journal lines whose project date is in the period, posted or not.'),
      kpis: [
        m('qty', 'Quantity issued', 'cube', 'number', sum(cur, 'Quantity'), sum(prev, 'Quantity'), true, 'Item quantity on those journal lines.'),
        m('active', 'Projects with usage', 'briefcase', 'number', distinct(cur, 'ProjectId'), distinct(prev, 'ProjectId'), true, 'Different projects that had items charged in the period.'),
        m('projects', 'Projects', 'folder', 'number', projects.length, null, true, 'All projects set up in this company.'),
        m('open', 'Open item journals', 'document-text', 'number', openJournals, null, false, 'Item journals not yet posted — their cost is not on the project yet.'),
      ],
      trend: {
        title: 'Item cost',
        explain: 'Cost of items charged to projects per day, by the project date on each journal line.',
        format: 'money',
        ...ctx.trend(cur, prev, 'ProjectDate', (t) => num(t['CostAmount'])),
      },
      breakdowns: [
        { key: 'projects', title: 'Item cost by project', kind: 'bars', format: 'money', rows: byProject, insight: share(byProject), explain: 'Which projects drew the most stock in the period. Compare with each project’s budget.' },
        { key: 'stage', title: 'Projects by stage', kind: 'bars', format: 'number', rows: byStage, explain: 'How many projects sit in each stage right now.' },
      ],
      attention: openJournals ? [{ tone: 'warning', text: `${openJournals} project item journals are not posted.` }] : [],
    };
  },
};

export const MODULE_DASHBOARDS: readonly ModuleDashboardDef[] = [
  inventory,
  purchaseOrder,
  salesOrder,
  returnOrder,
  project,
  production,
  warehouse,
  inquiry,
];

export function findDashboard(moduleKey: string): ModuleDashboardDef | undefined {
  return MODULE_DASHBOARDS.find((d) => d.moduleKey === moduleKey);
}

export type { DashboardData };
