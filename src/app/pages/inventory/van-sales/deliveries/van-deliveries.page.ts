import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { FormatService } from '../../../../core';
import { VanDayService } from '../../../../core/services/van-day.service';
import { SalesOrder, SalesOrderStatus, VanDocumentsService, VanStoreService } from '../../../../core/van-sales';
import { ORDER_STATUS, orderTotal, StatusStyle } from '../deliver/van-order-view';

interface DeliveryRow {
  order: SalesOrder;
  total: number;
  qty: number;
  status: StatusStyle;
  receiptId: string | null;
}

interface CustomerGroup {
  customerId: string;
  name: string;
  address: string;
  ready: number;
  rows: DeliveryRow[];
}

const STATUS_RANK: Record<SalesOrderStatus, number> = { READY: 0, PARTIALLY_DELIVERED: 1, DELIVERED: 2, REJECTED: 3 };

/** The delivery rep's orders, grouped by customer, Ready first. */
@Component({
  selector: 'app-van-deliveries',
  templateUrl: './van-deliveries.page.html',
  styleUrls: ['./van-deliveries.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanDeliveriesPage implements OnInit {
  private readonly router = inject(Router);
  private readonly format = inject(FormatService);
  private readonly toastCtrl = inject(ToastController);
  private readonly docs = inject(VanDocumentsService);
  private readonly day = inject(VanDayService);
  readonly store = inject(VanStoreService);

  readonly toDeliver = computed(() => this.store.orders().filter((o) => o.status === 'READY').length);

  readonly groups = computed<CustomerGroup[]>(() => {
    const deliveries = this.docs.documents().filter((d) => d.type === 'DELIVERY');
    const byCustomer = new Map<string, CustomerGroup>();
    for (const order of this.store.orders()) {
      let g = byCustomer.get(order.customerId);
      if (!g) {
        const c = this.store.customer(order.customerId);
        g = { customerId: order.customerId, name: c?.name ?? order.customerId, address: c?.address ?? '', ready: 0, rows: [] };
        byCustomer.set(order.customerId, g);
      }
      if (order.status === 'READY') g.ready++;
      g.rows.push({
        order,
        total: orderTotal(order, this.store),
        qty: order.lines.reduce((s, l) => s + l.qty, 0),
        status: ORDER_STATUS[order.status],
        receiptId: deliveries.find((d) => d.salesId === order.salesId)?.id ?? null,
      });
    }
    const groups = [...byCustomer.values()];
    for (const g of groups) g.rows.sort((a, b) => STATUS_RANK[a.order.status] - STATUS_RANK[b.order.status]);
    return groups.sort((a, b) => Number(b.ready > 0) - Number(a.ready > 0) || a.name.localeCompare(b.name));
  });

  ngOnInit(): void {
    void this.store.ensureLoaded();
  }

  async open(row: DeliveryRow): Promise<void> {
    const { order } = row;
    if (order.status === 'READY') {
      const visit = this.day.visits().find((v) => v.account === order.customerId);
      if (visit) this.day.setCurrentVisit(visit.id);
      this.router.navigate(['/inventory/van-sales/deliver', order.salesId]);
      return;
    }
    if (row.receiptId) {
      this.router.navigate(['/inventory/van-sales/receipt', row.receiptId]);
      return;
    }
    const toast = await this.toastCtrl.create({
      message: 'No receipt on this device for this order.',
      duration: 1800,
      position: 'top',
      color: 'medium',
    });
    await toast.present();
  }

  money(n: number): string {
    return this.format.number(n, 2, 2);
  }
}
