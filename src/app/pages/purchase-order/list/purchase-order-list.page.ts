import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader } from '../../../models/purchase-order.model';

@Component({
  selector: 'app-purchase-order-list',
  templateUrl: './purchase-order-list.page.html',
  styleUrls: ['./purchase-order-list.page.scss'],
  standalone: false
})
export class PurchaseOrderListPage {
  @ViewChild(IonInfiniteScroll) infiniteScroll!: IonInfiniteScroll;

  orders: PurchaseOrderHeader[] = [];
  allOrders: PurchaseOrderHeader[] = [];
  filteredOrders: PurchaseOrderHeader[] = [];
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
    private poService: PurchaseOrderService
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
    this.poService.getOrderHeaders(0).subscribe({
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
          message: 'Failed to load purchase orders. Please try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  loadMore(event: CustomEvent) {
    if (!this.hasMore) {
      (event.target as HTMLIonInfiniteScrollElement).complete();
      return;
    }
    this.isLoadingMore = true;
    this.poService.getOrderHeaders(this.orders.length).subscribe({
      next: (res) => {
        this.orders = this.deduplicate([...this.orders, ...res.value]);
        this.filteredOrders = [...this.orders];
        this.isLoadingMore = false;
        (event.target as HTMLIonInfiniteScrollElement).complete();
        if (!this.hasMore) {
          (event.target as HTMLIonInfiniteScrollElement).disabled = true;
        }
      },
      error: async () => {
        this.isLoadingMore = false;
        (event.target as HTMLIonInfiniteScrollElement).complete();
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
    this.poService.getOrderHeaders(this.orders.length).subscribe({
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
      this.filteredOrders = [...this.orders];
      if (this.infiniteScroll) {
        this.infiniteScroll.disabled = !this.hasMore;
      }
      return;
    }

    if (this.allDataLoaded) {
      this.filterLocally(term);
      return;
    }

    this.isSearching = true;
    this.poService.getAllOrderHeaders().subscribe({
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
    const vendor = (order: PurchaseOrderHeader) =>
      ((order.OrderVendorAccountNumber ?? order.VendorAccountNumber ?? '') as string).toLowerCase();
    this.filteredOrders = this.allOrders.filter((order) =>
      order.PurchaseOrderNumber.toLowerCase().includes(t) ||
      vendor(order).includes(t)
    );
  }

  openDetail(poNumber: string) {
    this.router.navigate(['/purchase-order/detail', poNumber]);
  }

  doRefresh(event: CustomEvent) {
    this.allDataLoaded = false;
    this.allOrders = [];
    this.orders = [];
    this.totalCount = 0;
    this.poService.getOrderHeaders(0).subscribe({
      next: (res) => {
        this.orders = this.deduplicate(res.value);
        this.filteredOrders = [...this.orders];
        this.totalCount = res['@odata.count'] ?? res.value.length;
        (event.target as HTMLIonRefresherElement).complete();
        if (this.infiniteScroll) {
          this.infiniteScroll.disabled = !this.hasMore;
        }
      },
      error: async () => {
        (event.target as HTMLIonRefresherElement).complete();
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

  private deduplicate(list: PurchaseOrderHeader[]): PurchaseOrderHeader[] {
    const seen = new Set<string>();
    return list.filter((o) => {
      if (seen.has(o.PurchaseOrderNumber)) return false;
      seen.add(o.PurchaseOrderNumber);
      return true;
    });
  }

  getStatusColor(status?: string): string {
    switch (status) {
      case 'Backorder':  return 'warning';
      case 'Received':   return 'success';
      case 'Invoiced':   return 'tertiary';
      case 'Canceled':   return 'danger';
      default:           return 'primary';
    }
  }

  getApprovalColor(status?: string): string {
    switch (status) {
      case 'Confirmed':  return 'success';
      case 'InReview':   return 'warning';
      case 'Draft':      return 'medium';
      case 'Rejected':   return 'danger';
      default:           return 'medium';
    }
  }

  getStatusStripColor(status?: string): string {
    switch (status) {
      case 'Backorder':  return 'var(--ion-color-warning)';
      case 'Received':   return 'var(--ion-color-success)';
      case 'Invoiced':   return 'var(--ion-color-tertiary)';
      case 'Canceled':   return 'var(--ion-color-danger)';
      default:           return 'var(--ion-color-primary)';
    }
  }
}
