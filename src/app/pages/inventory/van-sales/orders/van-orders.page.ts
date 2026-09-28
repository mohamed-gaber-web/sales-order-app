import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormatService } from '../../../../core';
import {
  localIsoDate,
  SalesOrder,
  SalesOrderLine,
  VanDocumentsService,
  VanStoreService,
} from '../../../../core/van-sales';
import { ORDER_STATUS, orderTotal, StatusStyle } from '../deliver/van-order-view';

type OrdersFilter = 'TODAY' | 'ALL';

interface OrderRow {
  salesId: string;
  customerName: string;
  shipDate: string;
  total: number;
  lineCount: number;
  lines: SalesOrderLine[];
  status: StatusStyle;
  today: boolean;
  hasDoc: boolean;
}

/**
 * The pre-seller's orders: what this device took today plus what D365 holds
 * for the route. Orders are taken from a visit, so there is no "new" here.
 */
@Component({
  selector: 'app-van-orders',
  templateUrl: './van-orders.page.html',
  styleUrls: ['./van-orders.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanOrdersPage implements OnInit {
  private readonly router = inject(Router);
  private readonly format = inject(FormatService);
  private readonly docs = inject(VanDocumentsService);
  readonly store = inject(VanStoreService);

  readonly filter = signal<OrdersFilter>('TODAY');
  readonly expanded = signal<string | null>(null);

  private readonly rows = computed<OrderRow[]>(() => {
    const today = localIsoDate();
    const orders = this.store.orders();
    const known = new Set(orders.map((o) => o.salesId));
    const todaysDocs = this.docs.todays().filter((d) => d.type === 'ORDER');
    const todayIds = new Set(todaysDocs.map((d) => d.id));

    const rows: OrderRow[] = orders.map((o) => this.toRow(o, todayIds.has(o.salesId) || o.createdAt.slice(0, 10) === today));

    // An order document whose order is no longer in the store (e.g. after a pull).
    for (const d of todaysDocs) {
      if (known.has(d.id)) continue;
      rows.push({
        salesId: d.id,
        customerName: d.customerName,
        shipDate: '',
        total: d.total,
        lineCount: d.lines.length,
        lines: d.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, freeQty: l.freeQty, unitPrice: l.unitPrice, lineDiscount: l.lineDiscount })),
        status: ORDER_STATUS.READY,
        today: true,
        hasDoc: true,
      });
    }
    return rows.sort((a, b) => Number(b.today) - Number(a.today) || b.salesId.localeCompare(a.salesId));
  });

  readonly visible = computed(() => (this.filter() === 'TODAY' ? this.rows().filter((r) => r.today) : this.rows()));
  readonly todayCount = computed(() => this.rows().filter((r) => r.today).length);
  readonly todayTotal = computed(() => this.rows().filter((r) => r.today).reduce((s, r) => s + r.total, 0));

  ngOnInit(): void {
    void this.store.ensureLoaded();
  }

  open(row: OrderRow): void {
    if (this.docs.get(row.salesId)) {
      this.router.navigate(['/inventory/van-sales/receipt', row.salesId]);
      return;
    }
    this.expanded.set(this.expanded() === row.salesId ? null : row.salesId);
  }

  goToRoute(): void {
    this.router.navigate(['/inventory/van-sales']);
  }

  productName(itemId: string): string {
    return this.store.productName(itemId);
  }

  money(n: number): string {
    return this.format.number(n, 2, 2);
  }

  private toRow(o: SalesOrder, today: boolean): OrderRow {
    return {
      salesId: o.salesId,
      customerName: this.store.customer(o.customerId)?.name ?? o.customerId,
      shipDate: o.requestedShipDate,
      total: orderTotal(o, this.store),
      lineCount: o.lines.length,
      lines: o.lines,
      status: ORDER_STATUS[o.status],
      today,
      hasDoc: !!this.docs.get(o.salesId),
    };
  }
}
