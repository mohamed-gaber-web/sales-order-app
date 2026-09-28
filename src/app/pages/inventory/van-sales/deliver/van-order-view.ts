import { round2, SalesOrder, SalesOrderStatus, VanStoreService } from '../../../../core/van-sales';

/** Shared by the Orders, Deliveries and Deliver pages. */
export interface StatusStyle {
  label: string;
  color: string;
  bg: string;
}

export const ORDER_STATUS: Record<SalesOrderStatus, StatusStyle> = {
  READY: { label: 'Ready', color: '#1a3b6a', bg: '#e6eefb' },
  DELIVERED: { label: 'Delivered', color: '#0e6f4e', bg: '#e3f5ec' },
  PARTIALLY_DELIVERED: { label: 'Partially delivered', color: '#9a6a00', bg: '#fdf3d7' },
  REJECTED: { label: 'Rejected', color: '#b42318', bg: '#fdecec' },
};

/**
 * The order's total incl. VAT. D365 orders can arrive with `total` 0, so fall
 * back to a preview from the lines — display only; posting recomputes it.
 */
export function orderTotal(order: SalesOrder, store: VanStoreService): number {
  if (order.total) return order.total;
  let total = 0;
  for (const l of order.lines) {
    const net = round2(l.qty * l.unitPrice - l.lineDiscount);
    total += net + round2((net * store.vatPctOf(l.itemId)) / 100);
  }
  return round2(total);
}
