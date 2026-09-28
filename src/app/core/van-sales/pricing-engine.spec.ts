import { priceCart, PricingInput, round2 } from './pricing-engine';
import {
  MOCK_LOYALTY,
  MOCK_PRICE_GROUP_FACTORS,
  MOCK_PRICES,
  MOCK_PRODUCTS,
  MOCK_PROMOTIONS,
  MOCK_TAX_GROUPS,
} from './van-sales-mock.data';
import { PromotionRule } from './van-sales.models';

const TODAY = '2026-09-27';

function input(lines: [string, number][], overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    lines: lines.map(([itemId, qty]) => ({ itemId, qty, unit: 'pcs' })),
    customer: { id: 'CU-TEST', priceGroup: 'Retail' },
    products: MOCK_PRODUCTS,
    prices: MOCK_PRICES,
    promotions: MOCK_PROMOTIONS,
    taxGroups: MOCK_TAX_GROUPS,
    today: TODAY,
    groupFactors: MOCK_PRICE_GROUP_FACTORS,
    loyalty: MOCK_LOYALTY,
    ...overrides,
  };
}

describe('priceCart (spec §8.1)', () => {
  it('prices from the group factor when no agreement exists', () => {
    const r = priceCart(input([['1001', 1]], { customer: { id: 'x', priceGroup: 'Wholesale' } }));
    expect(r.lines[0].unitPrice).toBe(74.1);
  });

  it('prefers an explicit agreement over the group factor', () => {
    const r = priceCart(input([['1004', 1]], { customer: { id: 'x', priceGroup: 'Key account' } }));
    expect(r.lines[0].unitPrice).toBe(108);
  });

  it('scenario 1 — FOC: 20 pasta earns 2 free and totals 330.60', () => {
    const r = priceCart(input([['1003', 20]]));
    expect(r.lines[0].freeQty).toBe(2);
    expect(r.freeGoods).toEqual([{ itemId: '1003', qty: 2 }]);
    expect(r.gross).toBe(290);
    expect(r.net).toBe(290);
    expect(r.vat).toBe(40.6);
    expect(r.total).toBe(330.6);
    expect(r.appliedPromoIds).toContain('PR-FOC-PASTA');
    expect(r.lines[0].promoLabel).toContain('+2 free');
  });

  it('gives no free goods below the buy quantity', () => {
    expect(priceCart(input([['1003', 9]])).lines[0].freeQty).toBe(0);
  });

  it('scenario 2 — tier then threshold: 48 tomato paste gets 5%, then 2% on the invoice', () => {
    const r = priceCart(input([['1004', 48]], { customer: { id: 'x', priceGroup: 'Wholesale' } }));
    expect(r.gross).toBe(5280);
    expect(r.lineDiscount).toBe(264);
    expect(r.invoiceDiscount).toBe(100.32);
    expect(r.net).toBe(4915.68);
    expect(r.vat).toBe(688.2);
    expect(r.total).toBe(5603.88);
    expect(r.appliedPromoIds).toEqual(jasmine.arrayContaining(['PR-TIER-TOMATO', 'PR-INV-5000']));
  });

  it('gives no tier discount below the minimum quantity', () => {
    const r = priceCart(input([['1004', 47]], { customer: { id: 'x', priceGroup: 'Wholesale' } }));
    expect(r.lineDiscount).toBe(0);
  });

  it('applies mix & match only when every item reaches its minimum', () => {
    const both = priceCart(input([['1007', 6], ['1008', 6]]));
    expect(both.appliedPromoIds).toContain('PR-MIX-BREAKFAST');
    expect(both.lineDiscount).toBe(round2(6 * 42 * 0.03 + 6 * 58 * 0.03));

    const one = priceCart(input([['1007', 6], ['1008', 5]]));
    expect(one.appliedPromoIds).not.toContain('PR-MIX-BREAKFAST');
  });

  it('ignores an expired promotion', () => {
    // PR-OIL-SUMMER ran June–August.
    const r = priceCart(input([['1001', 12]]));
    expect(r.appliedPromoIds).not.toContain('PR-OIL-SUMMER');
    expect(r.lineDiscount).toBe(0);
  });

  it('honours customer groups on a promotion', () => {
    const keyOnly: PromotionRule = { ...MOCK_PROMOTIONS[0], id: 'KEY-ONLY', customerGroups: ['Key account'] };
    const r = priceCart(input([['1003', 20]], { promotions: [keyOnly] }));
    expect(r.lines[0].freeQty).toBe(0);
  });

  it('skips a promotion whose budget is exhausted, and caps one that is nearly spent', () => {
    const tier: PromotionRule = { ...MOCK_PROMOTIONS[1], id: 'T', budgetRemaining: 0 };
    const exhausted = priceCart(input([['1004', 48]], { promotions: [tier] }));
    expect(exhausted.lineDiscount).toBe(0);

    const capped = priceCart(input([['1004', 48]], { promotions: [{ ...tier, budgetRemaining: 50 }] }));
    expect(capped.lineDiscount).toBe(50);
  });

  it('applies the manual discount after the invoice threshold', () => {
    const r = priceCart(input([['1003', 10]], { manualDiscountPct: 3, promotions: [] }));
    expect(r.manualDiscount).toBe(4.35);
    expect(r.net).toBe(140.65);
  });

  it('caps redemption by the points held, the minimum, and the remaining net', () => {
    const held = priceCart(input([['1001', 10]], { redeemPoints: 10_000, customerPoints: 500 }));
    expect(held.redeemedPoints).toBe(500);
    expect(held.redeemedValue).toBe(50);

    const belowMin = priceCart(input([['1001', 10]], { redeemPoints: 50, customerPoints: 50 }));
    expect(belowMin.redeemedPoints).toBe(0);

    const byNet = priceCart(input([['1003', 1]], { redeemPoints: 10_000, customerPoints: 10_000 }));
    expect(byNet.redeemedPoints).toBe(145);
    expect(byNet.net).toBe(0);
  });

  it('keeps line VAT summing exactly to the header, with rounding on every line', () => {
    const r = priceCart(
      input([['1001', 7], ['1003', 13], ['1006', 3], ['1008', 11]], { manualDiscountPct: 2.5 })
    );
    const lineNet = round2(r.lines.reduce((s, l) => s + l.net, 0));
    const lineVat = round2(r.lines.reduce((s, l) => s + l.vat, 0));
    expect(lineNet).toBe(r.net);
    expect(lineVat).toBe(r.vat);
    expect(r.total).toBe(round2(r.net + r.vat));
  });

  it('earns points on the net', () => {
    const r = priceCart(input([['1002', 10]]));
    expect(r.pointsToEarn).toBe(Math.floor(1850 * 0.01));
  });
});
