import { agingBuckets, buildReport, documentsCsv, periodRange, topN } from './van-reports';
import { Customer, VanDocument } from './van-sales.models';

const TODAY = '2026-09-30';

function doc(p: Partial<VanDocument>): VanDocument {
  return {
    id: 'D',
    type: 'INVOICE',
    customerId: 'CU-1',
    customerName: 'One',
    createdAt: `${TODAY}T09:00:00`,
    lines: [],
    gross: 0,
    discounts: 0,
    net: 0,
    vat: 0,
    total: 0,
    eDocStatus: 'QUEUED',
    mobileTransId: 'm',
    ...p,
  };
}

describe('van reports', () => {
  it('builds period ranges ending today', () => {
    expect(periodRange('TODAY', TODAY).days).toEqual([TODAY]);
    const week = periodRange('7D', TODAY);
    expect(week.days.length).toBe(7);
    expect(week.from).toBe('2026-09-24');
    expect(periodRange('30D', TODAY).from).toBe('2026-09-01');
  });

  it('keeps only documents inside the period', () => {
    const docs = [doc({ total: 100 }), doc({ total: 50, createdAt: '2026-09-20T09:00:00' })];
    expect(buildReport(docs, 'TODAY', TODAY).sales.total).toBe(100);
    expect(buildReport(docs, '30D', TODAY).sales.total).toBe(150);
  });

  it('splits sales by payment and averages the drop', () => {
    const r = buildReport(
      [doc({ total: 300, payMode: 'CASH' }), doc({ total: 100, payMode: 'CREDIT', type: 'DELIVERY' }), doc({ type: 'ORDER', total: 999 })],
      'TODAY',
      TODAY
    );
    expect(r.sales).toEqual({ total: 400, count: 2, avgDrop: 200, cash: 300, credit: 100, customers: 1 });
    expect(r.orders).toEqual({ total: 999, count: 1 });
  });

  it('reports collections in a fixed method order, zeros included', () => {
    const r = buildReport([doc({ type: 'RECEIPT', total: 500, paymentMethod: 'E_WALLET' })], 'TODAY', TODAY);
    expect(r.collections.byMethod.map((m) => [m.key, m.value])).toEqual([
      ['CASH', 0],
      ['PDC', 0],
      ['E_WALLET', 500],
    ]);
  });

  it('adds product lines across documents and folds the tail into Other', () => {
    const line = (itemId: string, net: number) => ({ itemId, name: itemId, qty: 1, freeQty: 0, unitPrice: net, lineDiscount: 0, net });
    const r = buildReport(
      [doc({ lines: [line('A', 10), line('B', 30)] }), doc({ lines: [line('A', 25), line('C', 5), line('D', 1)] })],
      'TODAY',
      TODAY,
      2
    );
    expect(r.byProduct.map((s) => [s.key, s.value])).toEqual([
      ['A', 35],
      ['B', 30],
      ['__other', 6],
    ]);
  });

  it('fills every day of the period, including quiet ones', () => {
    const r = buildReport([doc({ total: 40 })], '7D', TODAY);
    expect(r.byDay.length).toBe(7);
    expect(r.byDay[6].value).toBe(40);
    expect(r.byDay.slice(0, 6).every((d) => d.value === 0)).toBeTrue();
  });

  it('topN leaves short lists alone', () => {
    expect(topN([{ key: 'a', label: 'a', value: 1 }], 3).length).toBe(1);
  });

  it('ages open invoices by days past due and skips credit notes', () => {
    const customers = [
      {
        openInvoices: [
          { invoiceId: '1', date: '2026-09-25', dueDate: '2026-10-25', amount: 100 },
          { invoiceId: '2', date: '2026-08-01', dueDate: '2026-09-10', amount: 200 },
          { invoiceId: '3', date: '2026-05-01', dueDate: '2026-06-01', amount: 300 },
          { invoiceId: 'CN', date: '2026-09-01', amount: -50 },
        ],
      } as Customer,
    ];
    const b = agingBuckets(customers, TODAY);
    expect(b.map((x) => x.value)).toEqual([100, 200, 0, 0, 300]);
  });

  it('writes CSV that a spreadsheet cannot run as a formula', () => {
    const csv = documentsCsv([doc({ id: 'VI-1', customerName: '=HYPERLINK("x")', total: -5 })]);
    const row = csv.split('\n')[1];
    expect(row).toContain(`"'=HYPERLINK(""x"")"`);
    expect(row).toContain(',-5,');
  });
});
