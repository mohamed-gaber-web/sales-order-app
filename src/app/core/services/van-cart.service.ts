import { computed, Injectable, signal } from '@angular/core';
import { VanCartLine, VanProduct } from '../../models/van-sales.model';

const STORAGE_KEY = 'gp.vanSales.cart';
const MAX_QTY = 999999;

/**
 * The driver's cart, shared across the catalogue, cart and checkout pages.
 *
 * State lives in signals so the pages can run OnPush, and is mirrored to
 * localStorage — a driver walking a branch can lose the app to a phone call or a
 * reload mid-round, and re-picking a full cart by hand is not acceptable.
 */
@Injectable({ providedIn: 'root' })
export class VanCartService {
  private readonly _lines = signal<VanCartLine[]>(this.restore());

  /** Cart contents, in the order the driver added them. */
  readonly lines = this._lines.asReadonly();

  /** Number of distinct products in the cart. */
  readonly count = computed(() => this._lines().length);

  /** Sum of every line quantity. */
  readonly totalQty = computed(() =>
    this._lines().reduce((sum, l) => sum + l.qty, 0)
  );

  /** Cart value across all lines. */
  readonly totalAmount = computed(() =>
    this._lines().reduce((sum, l) => sum + l.qty * l.price, 0)
  );

  readonly isEmpty = computed(() => this._lines().length === 0);

  /** Item number → quantity, so the catalogue can show steppers without a scan per tile. */
  readonly qtyByItem = computed(() => {
    const map = new Map<string, number>();
    for (const l of this._lines()) map.set(l.itemNumber, l.qty);
    return map;
  });

  qtyOf(itemNumber: string): number {
    return this.qtyByItem().get(itemNumber) ?? 0;
  }

  has(itemNumber: string): boolean {
    return this.qtyByItem().has(itemNumber);
  }

  /**
   * Adds a product, or tops up the quantity if it's already in the cart —
   * re-scanning the same barcode should count another unit, not error.
   */
  add(product: VanProduct, qty = 1): void {
    const delta = this.clampQty(qty);
    if (delta <= 0) return;

    this.update((lines) => {
      const index = lines.findIndex((l) => l.itemNumber === product.itemNumber);
      if (index === -1) {
        return [
          ...lines,
          {
            itemNumber: product.itemNumber,
            name: product.name,
            imageUrl: product.imageUrl,
            price: product.price ?? 0,
            unit: product.unit,
            qty: delta,
          },
        ];
      }
      const next = [...lines];
      next[index] = { ...next[index], qty: this.clampQty(next[index].qty + delta) };
      return next;
    });
  }

  /** Sets an exact quantity. Zero or less removes the line. */
  setQty(itemNumber: string, qty: number): void {
    const next = this.clampQty(qty);
    if (next <= 0) {
      this.remove(itemNumber);
      return;
    }
    this.update((lines) =>
      lines.map((l) => (l.itemNumber === itemNumber ? { ...l, qty: next } : l))
    );
  }

  /** Steps a quantity up or down. Stepping the last unit off removes the line. */
  adjustQty(itemNumber: string, delta: number): void {
    const current = this.qtyOf(itemNumber);
    if (current === 0) return;
    this.setQty(itemNumber, current + delta);
  }

  remove(itemNumber: string): void {
    this.update((lines) => lines.filter((l) => l.itemNumber !== itemNumber));
  }

  clear(): void {
    this.update(() => []);
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private update(fn: (lines: VanCartLine[]) => VanCartLine[]): void {
    const next = fn(this._lines());
    this._lines.set(next);
    this.persist(next);
  }

  /** Quantities are whole units, at least 0, and bounded so a stuck key can't overflow. */
  private clampQty(qty: number): number {
    const n = Math.floor(Number(qty));
    if (!Number.isFinite(n)) return 0;
    return Math.min(Math.max(n, 0), MAX_QTY);
  }

  private persist(lines: VanCartLine[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Private browsing or a full quota — the cart still works for this session.
    }
  }

  private restore(): VanCartLine[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((l): l is VanCartLine =>
          !!l && typeof (l as VanCartLine).itemNumber === 'string'
        )
        .map((l) => ({
          ...l,
          price: Number(l.price) || 0,
          qty: Math.max(1, Math.floor(Number(l.qty)) || 1),
        }));
    } catch {
      return [];
    }
  }
}
