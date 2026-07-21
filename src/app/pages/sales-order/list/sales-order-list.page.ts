import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { SalesOrderService } from '../../../core/services/sales-order.service';
import { SalesOrderHeaderResponse } from '../../../models/sales-order.model';

@Component({
  selector: 'app-sales-order-list',
  templateUrl: './sales-order-list.page.html',
  styleUrls: ['./sales-order-list.page.scss'],
  standalone: false
})
export class SalesOrderListPage {
  orders: SalesOrderHeaderResponse[] = [];
  filteredOrders: SalesOrderHeaderResponse[] = [];
  searchTerm = '';
  isLoading = false;
  totalCount = 0;
  company = 'usmf';
  isReturnMode = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private toastCtrl: ToastController,
    private salesOrderService: SalesOrderService
  ) {
    this.isReturnMode = this.route.snapshot.data['mode'] === 'return';
  }

  ionViewWillEnter() {
    this.loadOrders();
  }

  loadOrders() {
    this.isLoading = true;
    this.salesOrderService.getAllOrderHeaders(this.isReturnMode).subscribe({
      next: (res) => {
        this.orders = this.deduplicate(res.value);
        this.totalCount = res['@odata.count'] ?? this.orders.length;
        this.filterLocally(this.searchTerm);
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: 'Couldn\'t load orders. Pull down to refresh.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  onQueryChange(term: string) {
    this.searchTerm = term;
    this.filterLocally(term);
  }

  onSearchChange() {
    this.filterLocally(this.searchTerm);
  }

  private filterLocally(term: string) {
    const t = term.trim().toLowerCase();
    if (!t) {
      this.filteredOrders = [...this.orders];
      return;
    }
    this.filteredOrders = this.orders.filter((order) =>
      order.SalesId.toLowerCase().includes(t) ||
      order.CustAccount.toLowerCase().includes(t) ||
      (order.SalesTable_SalesName ?? '').toLowerCase().includes(t) ||
      (order.SalesTable_InvoiceAccount ?? '').toLowerCase().includes(t)
    );
  }

  createOrder() {
    this.router.navigate(['/sales-order/create']);
  }

  scanOrder() {
    this.router.navigate(['/sales-order/scan']);
  }

  openOrderLine(salesId: string) {
    this.router.navigate(['/sales-order-line/detail', salesId]);
  }

  doRefresh(event: any) {
    this.salesOrderService.getAllOrderHeaders(this.isReturnMode).subscribe({
      next: (res) => {
        this.orders = this.deduplicate(res.value);
        this.totalCount = res['@odata.count'] ?? this.orders.length;
        this.filterLocally(this.searchTerm);
        event.target.complete();
      },
      error: async () => {
        event.target.complete();
        const toast = await this.toastCtrl.create({
          message: 'Refresh failed. Try again.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  private deduplicate(list: SalesOrderHeaderResponse[]): SalesOrderHeaderResponse[] {
    const seen = new Set<string>();
    return list.filter((o) => {
      if (seen.has(o.SalesId)) return false;
      seen.add(o.SalesId);
      return true;
    });
  }

  getStatusColor(status?: string): string {
    switch (status) {
      case 'Invoiced':   return 'success';
      case 'Backorder':  return 'warning';
      case 'Delivered':  return 'tertiary';
      case 'Canceled':   return 'danger';
      default:           return 'primary';
    }
  }

  getReleaseStatusColor(status?: string): string {
    switch (status) {
      case 'Invoice':      return 'success';
      case 'PackingSlip':  return 'tertiary';
      case 'PickingList':  return 'warning';
      case 'None':         return 'medium';
      default:             return 'medium';
    }
  }

  getStatusPillColor(status?: string): string {
    switch (status) {
      case 'Invoiced':   return '#065f46';
      case 'Backorder':  return '#92400e';
      case 'Delivered':  return '#4c1d95';
      case 'Canceled':   return '#991b1b';
      default:           return '#1e3a5f';
    }
  }

  getStatusPillBg(status?: string): string {
    switch (status) {
      case 'Invoiced':   return 'rgba(16,185,129,.12)';
      case 'Backorder':  return 'rgba(217,119,6,.12)';
      case 'Delivered':  return 'rgba(109,40,217,.12)';
      case 'Canceled':   return 'rgba(220,38,38,.12)';
      default:           return 'rgba(0,37,89,.10)';
    }
  }

  getReleaseStatusPillColor(status?: string): string {
    switch (status) {
      case 'Invoice':      return '#065f46';
      case 'PackingSlip':  return '#4c1d95';
      case 'PickingList':  return '#92400e';
      default:             return '#6b7280';
    }
  }

  getReleaseStatusPillBg(status?: string): string {
    switch (status) {
      case 'Invoice':      return 'rgba(16,185,129,.12)';
      case 'PackingSlip':  return 'rgba(109,40,217,.12)';
      case 'PickingList':  return 'rgba(217,119,6,.12)';
      default:             return 'rgba(107,114,128,.10)';
    }
  }
}
