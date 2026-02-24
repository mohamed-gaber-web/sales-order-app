import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, ToastController } from '@ionic/angular';
import { SalesOrderService } from '../../../core/services/sales-order.service';
import { SalesOrderHeaderResponse } from '../../../models/sales-order.model';

@Component({
  selector: 'app-sales-order-list',
  templateUrl: './sales-order-list.page.html',
  styleUrls: ['./sales-order-list.page.scss'],
  standalone: false
})
export class SalesOrderListPage {
  @ViewChild(IonInfiniteScroll) infiniteScroll!: IonInfiniteScroll;

  orders: SalesOrderHeaderResponse[] = [];
  filteredOrders: SalesOrderHeaderResponse[] = [];
  searchTerm = '';
  isLoading = false;
  isLoadingMore = false;
  totalCount = 0;

  get hasMore(): boolean {
    return this.orders.length < this.totalCount;
  }

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private salesOrderService: SalesOrderService
  ) {}

  ionViewWillEnter() {
    this.loadOrders();
  }

  loadOrders() {
    this.isLoading = true;
    this.orders = [];
    this.totalCount = 0;
    this.salesOrderService.getOrderHeaders(0).subscribe({
      next: (res) => {
        this.orders = res.value;
        this.totalCount = res['@odata.count'] ?? res.value.length;
        this.filterOrders();
        this.isLoading = false;
        if (this.infiniteScroll) {
          this.infiniteScroll.disabled = !this.hasMore;
        }
      },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: 'Failed to load sales orders. Please try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  loadMore(event: any) {
    if (!this.hasMore) {
      event.target.complete();
      return;
    }
    this.isLoadingMore = true;
    this.salesOrderService.getOrderHeaders(this.orders.length).subscribe({
      next: (res) => {
        this.orders = [...this.orders, ...res.value];
        this.filterOrders();
        this.isLoadingMore = false;
        event.target.complete();
        if (!this.hasMore) {
          event.target.disabled = true;
        }
      },
      error: async () => {
        this.isLoadingMore = false;
        event.target.complete();
        const toast = await this.toastCtrl.create({
          message: 'Failed to load more orders.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  loadMoreWeb() {
    if (!this.hasMore || this.isLoadingMore) return;
    this.isLoadingMore = true;
    this.salesOrderService.getOrderHeaders(this.orders.length).subscribe({
      next: (res) => {
        this.orders = [...this.orders, ...res.value];
        this.filterOrders();
        this.isLoadingMore = false;
      },
      error: async () => {
        this.isLoadingMore = false;
        const toast = await this.toastCtrl.create({
          message: 'Failed to load more orders.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  filterOrders() {
    if (!this.searchTerm.trim()) {
      this.filteredOrders = [...this.orders];
      return;
    }
    const term = this.searchTerm.toLowerCase();
    this.filteredOrders = this.orders.filter(order =>
      order.SalesId.toLowerCase().includes(term) ||
      order.CustAccount.toLowerCase().includes(term) ||
      (order.SalesTable_SalesName ?? '').toLowerCase().includes(term) ||
      (order.SalesTable_InvoiceAccount ?? '').toLowerCase().includes(term)
    );
  }

  onSearchChange() {
    this.filterOrders();
  }

  createOrder() {
    this.router.navigate(['/sales-order/create']);
  }

  doRefresh(event: any) {
    this.orders = [];
    this.totalCount = 0;
    this.salesOrderService.getOrderHeaders(0).subscribe({
      next: (res) => {
        this.orders = res.value;
        this.totalCount = res['@odata.count'] ?? res.value.length;
        this.filterOrders();
        event.target.complete();
        if (this.infiniteScroll) {
          this.infiniteScroll.disabled = !this.hasMore;
        }
      },
      error: async () => {
        event.target.complete();
        const toast = await this.toastCtrl.create({
          message: 'Failed to refresh orders.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
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
}
