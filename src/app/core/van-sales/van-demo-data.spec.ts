import { DEMO_PREFIX, demoActivity } from './van-demo-data';
import { buildReport, previousPeriodEnd } from './van-reports';

describe('demo activity', () => {
  const TODAY = '2026-09-30';

  it('is the same history for the same day', () => {
    const a = demoActivity(TODAY);
    const b = demoActivity(TODAY);
    expect(b.documents.length).toBe(a.documents.length);
    expect(b.documents.map((d) => d.total)).toEqual(a.documents.map((d) => d.total));
  });

  it('fills both the current and the previous 30 days, so deltas have a base', () => {
    const docs = demoActivity(TODAY).documents;
    const now = buildReport(docs, '30D', TODAY);
    const before = buildReport(docs, '30D', previousPeriodEnd('30D', TODAY));
    expect(now.sales.count).toBeGreaterThan(50);
    expect(before.sales.count).toBeGreaterThan(50);
    expect(now.collections.byMethod.every((m) => m.value > 0)).toBeTrue();
    expect(now.returns.count).toBeGreaterThan(0);
  });

  it('marks every document as demo and keeps its totals consistent', () => {
    for (const d of demoActivity(TODAY).documents) {
      expect(d.id.startsWith(DEMO_PREFIX)).toBeTrue();
      expect(Math.abs(d.net + d.vat - d.total)).toBeLessThan(0.011);
    }
  });

  it('gives each cheque a lifecycle that ends in its status', () => {
    for (const c of demoActivity(TODAY).cheques) {
      expect(c.history[c.history.length - 1].status).toBe(c.status);
      expect(c.history[0].status).toBe('WITH_REP');
    }
  });
});
