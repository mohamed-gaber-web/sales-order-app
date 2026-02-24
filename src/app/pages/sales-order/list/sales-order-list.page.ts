import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { SalesOrderService } from '../../../core/services/sales-order.service';
import { SalesOrderHeaderResponse } from '../../../models/sales-order.model';

@Component({
  selector: 'app-sales-order-list',
  templateUrl: './sales-order-list.page.html',
  styleUrls: ['./sales-order-list.page.scss'],
  standalone: false
})
export class SalesOrderListPage implements OnInit {
  orders: SalesOrderHeaderResponse[] = [];
  filteredOrders: SalesOrderHeaderResponse[] = [];
  searchTerm = '';
  isLoading = false;

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private salesOrderService: SalesOrderService
  ) {}

  ngOnInit() {
    this.loadOrders();
  }

  // Called every time the page becomes active (including navigating back)
  ionViewWillEnter() {
    this.loadOrders();
  }

  loadOrders() {
    this.isLoading = true;
    this.salesOrderService.getOrderHeaders().subscribe({
      next: (orders) => {
        this.orders = orders;
        this.filterOrders();
        this.isLoading = false;
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
    this.salesOrderService.getOrderHeaders().subscribe({
      next: (orders) => {
        this.orders = orders;
        this.filterOrders();
        event.target.complete();
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
