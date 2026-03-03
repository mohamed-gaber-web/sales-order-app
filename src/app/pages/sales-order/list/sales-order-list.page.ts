import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
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
  allOrders: SalesOrderHeaderResponse[] = [];
  filteredOrders: SalesOrderHeaderResponse[] = [];
  searchTerm = '';
  isLoading = false;
  isLoadingMore = false;
  isSearching = false;
  totalCount = 0;
  private allDataLoaded = false;

  private searchSubject = new Subject<string>();

  get hasMore(): boolean {
    return !this.searchTerm.trim() && this.orders.length < this.totalCount;
  }

  constructor(
    private router: Router,
    private toastCtrl: ToastController,
    private salesOrderService: SalesOrderService
  ) {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe((term) => {
      this.handleSearch(term);
    });
  }

  ionViewWillEnter() {
    this.allDataLoaded = false;
    this.allOrders = [];
    this.loadOrders();
  }

  loadOrders() {
    this.isLoading = true;
    this.orders = [];
    this.totalCount = 0;
    this.salesOrderService.getOrderHeaders(0).subscribe({
      next: (res) => {
        this.orders = this.deduplicate(res.value);
        this.filteredOrders = [...this.orders];
        this.totalCount = res['@odata.count'] ?? res.value.length;
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
        this.orders = this.deduplicate([...this.orders, ...res.value]);
        this.filteredOrders = [...this.orders];
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
        this.orders = this.deduplicate([...this.orders, ...res.value]);
        this.filteredOrders = [...this.orders];
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

  onSearchChange() {
    this.searchSubject.next(this.searchTerm.trim());
  }

  private handleSearch(term: string) {
    if (!term) {
      // Search cleared — show paginated data
      this.filteredOrders = [...this.orders];
      if (this.infiniteScroll) {
        this.infiniteScroll.disabled = !this.hasMore;
      }
      return;
    }

    // If all data already loaded, filter locally
    if (this.allDataLoaded) {
      this.filterLocally(term);
      return;
    }

    // Load all data from API then filter
    this.isSearching = true;
    this.salesOrderService.getAllOrderHeaders().subscribe({
      next: (res) => {
        this.allOrders = this.deduplicate(res.value);
        this.allDataLoaded = true;
        this.isSearching = false;
        this.filterLocally(term);
        if (this.infiniteScroll) {
          this.infiniteScroll.disabled = true;
        }
      },
      error: async () => {
        this.isSearching = false;
        const toast = await this.toastCtrl.create({
          message: 'Search failed. Please try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  private filterLocally(term: string) {
    const t = term.toLowerCase();
    this.filteredOrders = this.allOrders.filter((order) =>
      order.SalesId.toLowerCase().includes(t) ||
      order.CustAccount.toLowerCase().includes(t) ||
      (order.SalesTable_SalesName ?? '').toLowerCase().includes(t) ||
      (order.SalesTable_InvoiceAccount ?? '').toLowerCase().includes(t)
    );
  }

  createOrder() {
    this.router.navigate(['/sales-order/create']);
  }

  openOrderLine(salesId: string) {
    this.router.navigate(['/sales-order-line/detail', salesId]);
  }

  doRefresh(event: any) {
    this.allDataLoaded = false;
    this.allOrders = [];
    this.orders = [];
    this.totalCount = 0;
    this.salesOrderService.getOrderHeaders(0).subscribe({
      next: (res) => {
        this.orders = this.deduplicate(res.value);
        this.filteredOrders = [...this.orders];
        this.totalCount = res['@odata.count'] ?? res.value.length;
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
}
