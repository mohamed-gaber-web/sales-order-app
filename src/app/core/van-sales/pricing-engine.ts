import {
  CartLine,
  LoyaltyRules,
  PriceAgreement,
  PricedLine,
  PricingResult,
  Product,
  PromotionRule,
  TaxGroup,
} from './van-sales.models';

/**
 * The on-device pricing engine (spec §8.1). Pure: no I/O, no clock of its own,
 * no Angular — everything it needs is in the input, so it is tested with plain
 * values and the same inputs always price the same way.
 *
 * The order of application is fixed and must match D365
 * `VSPricingService/calculate` (#23); online, the sell screen asks D365 to
 * re-price before posting and warns when the two disagree. Change the order
 * here only together with the X++ side.
 */

export interface PricingInput {
  lines: CartLine[];
  customer: { id: string; priceGroup: string };
  products: Product[];
  prices: PriceAgreement[];
  promotions: PromotionRule[];
  taxGroups: TaxGroup[];
  /** ISO date (YYYY-MM-DD) the sale happens on — decides which promotions are live. */
  today: string;
  manualDiscountPct?: number;
  /** Points the rep chose to redeem. Capped by the balance and by the net. */
  redeemPoints?: number;
  customerPoints?: number;
  loyalty?: LoyaltyRules;
  /** Multiplier on base price when a group has no agreement (spec §8.1 step 1). */
  groupFactors?: Record<string, number>;
}

/** Rounds half away from zero to 2 dp, the way an invoice is printed. */
export function round2(n: number): number {
  return Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
}

/** A promotion is live on `today` for this customer and still has budget. */
export function isPromotionActive(rule: PromotionRule, today: string, priceGroup: string): boolean {
  if (rule.validFrom && today < rule.validFrom.slice(0, 10)) return false;
  if (rule.validTo && today > rule.validTo.slice(0, 10)) return false;
  if (rule.customerGroups?.length && !rule.customerGroups.includes(priceGroup)) return false;
  if (rule.budgetRemaining !== undefined && rule.budgetRemaining <= 0) return false;
  return true;
}

/** Caps a discount at what is left in the promotion's budget. */
function withinBudget(rule: PromotionRule, amount: number): number {
  return rule.budgetRemaining === undefined ? amount : Math.min(amount, rule.budgetRemaining);
}

function appliesToItem(rule: PromotionRule, itemId: string): boolean {
  return !rule.itemIds?.length || rule.itemIds.includes(itemId);
}

export function unitPriceFor(
  itemId: string,
  priceGroup: string,
  products: Product[],
  prices: PriceAgreement[],
  groupFactors: Record<string, number> = {}
): number {
  const agreement = prices.find((p) => p.itemId === itemId && p.priceGroup === priceGroup);
  if (agreement) return agreement.unitPrice;
  const product = products.find((p) => p.itemId === itemId);
  return round2((product?.basePrice ?? 0) * (groupFactors[priceGroup] ?? 1));
}

interface WorkLine {
  itemId: string;
  qty: number;
  freeQty: number;
  freeItemId?: string;
  unitPrice: number;
  gross: number;
  lineDiscount: number;
  promoIds: string[];
  labels: string[];
  ratePct: number;
}

export function priceCart(input: PricingInput): PricingResult {
  const group = input.customer.priceGroup;
  const live = input.promotions.filter((r) => isPromotionActive(r, input.today, group));
  const applied = new Set<string>();
  const freeGoods = new Map<string, number>();

  // 1. Unit price per line.
  const lines: WorkLine[] = input.lines
    .filter((l) => l.qty > 0)
    .map((l) => {
      const product = input.products.find((p) => p.itemId === l.itemId);
      const unitPrice = unitPriceFor(l.itemId, group, input.products, input.prices, input.groupFactors);
      const rate = input.taxGroups.find((t) => t.code === product?.taxGroup)?.ratePct ?? 0;
      return {
        itemId: l.itemId,
        qty: l.qty,
        freeQty: 0,
        unitPrice,
        gross: round2(unitPrice * l.qty),
        lineDiscount: 0,
        promoIds: [],
        labels: [],
        ratePct: rate,
      };
    });

  // 2. Line tier — the best tier the quantity reaches.
  for (const line of lines) {
    const best = live
      .filter((r) => r.type === 'LINE_TIER' && appliesToItem(r, line.itemId) && line.qty >= (r.minQty ?? 0))
      .sort((a, b) => (b.discountPct ?? 0) - (a.discountPct ?? 0))[0];
    if (!best) continue;
    const disc = round2(withinBudget(best, (line.gross * (best.discountPct ?? 0)) / 100));
    if (disc <= 0) continue;
    line.lineDiscount = round2(line.lineDiscount + disc);
    line.promoIds.push(best.id);
    line.labels.push(`${best.discountPct}% off ${best.minQty}+`);
    applied.add(best.id);
  }

  // 3. Free of charge — floor(qty / buy) × free, same or another item.
  for (const line of lines) {
    for (const rule of live.filter((r) => r.type === 'FOC' && appliesToItem(r, line.itemId))) {
      const buy = rule.buyQty ?? 0;
      if (buy <= 0 || line.qty < buy) continue;
      const free = Math.floor(line.qty / buy) * (rule.freeQty ?? 0);
      if (free <= 0) continue;
      const freeItem = rule.freeItemId ?? line.itemId;
      if (freeItem === line.itemId) {
        line.freeQty += free;
      } else {
        line.freeItemId = freeItem;
        line.freeQty += free;
      }
      freeGoods.set(freeItem, (freeGoods.get(freeItem) ?? 0) + free);
      line.promoIds.push(rule.id);
      line.labels.push(`+${free} free${freeItem === line.itemId ? '' : ' ' + freeItem}`);
      applied.add(rule.id);
    }
  }

  // 4. Mix & match — every listed item at or above minEachQty.
  for (const rule of live.filter((r) => r.type === 'MIX_MATCH' && r.itemIds?.length)) {
    const members = rule.itemIds!.map((id) => lines.find((l) => l.itemId === id));
    if (members.some((m) => !m || m.qty < (rule.minEachQty ?? 1))) continue;
    for (const m of members as WorkLine[]) {
      const base = m.gross - m.lineDiscount;
      const disc = round2(withinBudget(rule, (base * (rule.discountPct ?? 0)) / 100));
      if (disc <= 0) continue;
      m.lineDiscount = round2(m.lineDiscount + disc);
      m.promoIds.push(rule.id);
      m.labels.push(`Mix & match ${rule.discountPct}%`);
    }
    applied.add(rule.id);
  }

  const gross = round2(lines.reduce((s, l) => s + l.gross, 0));
  const lineDiscount = round2(lines.reduce((s, l) => s + l.lineDiscount, 0));
  const afterLine = round2(gross - lineDiscount);

  // 5. Invoice threshold — the best one the subtotal reaches.
  const threshold = live
    .filter((r) => r.type === 'INVOICE_THRESHOLD' && afterLine >= (r.minNetAmount ?? Infinity))
    .sort((a, b) => (b.discountPct ?? 0) - (a.discountPct ?? 0))[0];
  let invoiceDiscount = 0;
  if (threshold) {
    invoiceDiscount = round2(withinBudget(threshold, (afterLine * (threshold.discountPct ?? 0)) / 100));
    if (invoiceDiscount > 0) applied.add(threshold.id);
  }
  const afterInvoice = round2(afterLine - invoiceDiscount);

  // 6. Manual discount on what is left. The limit is enforced by the caller,
  //    which knows whether an approval exists.
  const manualDiscountPct = Math.max(0, input.manualDiscountPct ?? 0);
  const manualDiscount = round2((afterInvoice * manualDiscountPct) / 100);
  const afterManual = round2(afterInvoice - manualDiscount);

  // 7. Points redemption — never more than held, never below the minimum,
  //    never more than the remaining net.
  let redeemedPoints = 0;
  let redeemedValue = 0;
  const rules = input.loyalty;
  if (rules && (input.redeemPoints ?? 0) > 0 && rules.redeemValuePerPoint > 0) {
    const wanted = Math.min(input.redeemPoints ?? 0, input.customerPoints ?? 0);
    if (wanted >= rules.minRedeemPoints) {
      // The epsilon keeps 14.5 / 0.1 from flooring to 144.
      const maxByNet = Math.floor(afterManual / rules.redeemValuePerPoint + 1e-9);
      redeemedPoints = Math.min(wanted, maxByNet);
      redeemedValue = round2(redeemedPoints * rules.redeemValuePerPoint);
    }
  }
  const net = round2(afterManual - redeemedValue);

  // 8. VAT per line on the line's share of the net. Invoice-level reductions
  //    are spread by line value; the last line takes the rounding remainder so
  //    the lines always add up to the header.
  const invoiceLevel = round2(invoiceDiscount + manualDiscount + redeemedValue);
  const priced: PricedLine[] = [];
  let allocated = 0;
  lines.forEach((l, i) => {
    const lineNetBefore = round2(l.gross - l.lineDiscount);
    const share =
      i === lines.length - 1
        ? round2(invoiceLevel - allocated)
        : afterLine > 0
          ? round2((invoiceLevel * lineNetBefore) / afterLine)
          : 0;
    allocated = round2(allocated + share);
    const lineNet = round2(lineNetBefore - share);
    priced.push({
      itemId: l.itemId,
      qty: l.qty,
      freeQty: l.freeQty,
      freeItemId: l.freeItemId,
      unitPrice: l.unitPrice,
      gross: l.gross,
      lineDiscount: l.lineDiscount,
      net: lineNet,
      vat: round2((lineNet * l.ratePct) / 100),
      promoIds: l.promoIds,
      promoLabel: l.labels.length ? l.labels.join(' · ') : undefined,
    });
  });
  const vat = round2(priced.reduce((s, l) => s + l.vat, 0));

  // 9. Points to earn on the net.
  const pointsToEarn = rules ? Math.floor(net * rules.earnPerUnit) : 0;

  return {
    lines: priced,
    gross,
    lineDiscount,
    invoiceDiscount,
    manualDiscountPct,
    manualDiscount,
    redeemedPoints,
    redeemedValue,
    net,
    vat,
    total: round2(net + vat),
    pointsToEarn,
    appliedPromoIds: [...applied],
    freeGoods: [...freeGoods].map(([itemId, qty]) => ({ itemId, qty })),
  };
}

/** Human line for the promotions strip. */
export function describePromotion(rule: PromotionRule): string {
  switch (rule.type) {
    case 'LINE_TIER':
      return `${rule.discountPct}% off ${rule.minQty}+ pcs`;
    case 'FOC':
      return `Buy ${rule.buyQty}, get ${rule.freeQty} free${rule.freeItemId ? ' ' + rule.freeItemId : ''}`;
    case 'MIX_MATCH':
      return `${rule.discountPct}% when buying ${rule.minEachQty}+ of each of ${rule.itemIds?.join(', ')}`;
    case 'INVOICE_THRESHOLD':
      return `${rule.discountPct}% off invoices from ${rule.minNetAmount}`;
  }
}
