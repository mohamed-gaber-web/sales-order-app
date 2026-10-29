import { Component, inject, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, ModalController, ToastController } from '@ionic/angular';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader } from '../../../models/purchase-order.model';
import { ScannerModalComponent } from '../../inventory/scanner/scanner-modal.component';
import { TenantConfigStore } from '../../../core/tenant/tenant-config.store';

@Component({
  selector: 'app-purchase-order-list',
  templateUrl: './purchase-order-list.page.html',
  styleUrls: ['./purchase-order-list.page.scss'],
  standalone: false
})
export class PurchaseOrderListPage {
  private readonly tenantConfig = inject(TenantConfigStore);
  get company(): string {
    return this.tenantConfig.currentDataAreaId();
  }

  @ViewChild(IonInfiniteScroll) infiniteScroll!: IonInfiniteScroll;

  orders: PurchaseOrderHeader[] = [];
  filteredOrders: PurchaseOrderHeader[] = [];
  searchTerm = '';
  isLoading = false;
  isLoadingMore = false;
  isSearching = false;
  searchFailed = false;
  loadFailed = false;
  totalCount = 0;
  private searchSub?: Subscription;

  private searchSubject = new Subject<string>();
  private modalCtrl = inject(ModalController);

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
    this.loadOrders();
  }

  async scanOrder() {
    const modal = await this.modalCtrl.create({
      component: ScannerModalComponent,
      cssClass: 'scanner-modal',
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<string>();
    const poNumber = data?.trim();
    if (poNumber) {
      this.router.navigate(['/purchase-order/detail', poNumber]);
    }
  }

  loadOrders() {
    this.isLoading = true;
    this.loadFailed = false;
    this.orders = [];
    this.totalCount = 0;
    this.poService.getOrderHeaders(0, false).subscribe({
      next: (res) => {
        this.orders = this.deduplicate(res.value);
        this.filteredOrders = [...this.orders];
        this.totalCount = res['@odata.count'] ?? res.value.length;
        this.isLoading = false;
        if (this.infiniteScroll) {
          this.infiniteScroll.disabled = !this.hasMore;
        }
      },
      error: () => {
        this.isLoading = false;
        this.loadFailed = true;
      }
    });
  }

  loadMore(event: CustomEvent) {
    if (!this.hasMore) {
      (event.target as HTMLIonInfiniteScrollElement).complete();
      return;
    }
    this.isLoadingMore = true;
    this.poService.getOrderHeaders(this.orders.length, false).subscribe({
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
          message: 'Couldn\'t load more orders.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
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
    this.poService.getOrderHeaders(this.orders.length, false).subscribe({
      next: (res) => {
        this.orders = this.deduplicate([...this.orders, ...res.value]);
        this.filteredOrders = [...this.orders];
        this.isLoadingMore = false;
      },
      error: async () => {
        this.isLoadingMore = false;
        const toast = await this.toastCtrl.create({
          message: 'Couldn\'t load more orders.',
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
    this.searchSubject.next(term);
  }

  onSearchChange() {
    this.searchSubject.next(this.searchTerm.trim());
  }

  /** Runs the search for the current term again — the failed state's button. */
  retrySearch() {
    this.handleSearch(this.searchTerm.trim());
  }

  /**
   * Searched on the server — order number, vendor and item number — never by
   * downloading every order. A newer term cancels the request still in
   * flight, so a slow answer can't overwrite a newer one.
   */
  private handleSearch(term: string) {
    this.searchSub?.unsubscribe();
    this.searchFailed = false;

    if (!term) {
      this.isSearching = false;
      this.filteredOrders = [...this.orders];
      if (this.infiniteScroll) {
        this.infiniteScroll.disabled = !this.hasMore;
      }
      return;
    }

    this.isSearching = true;
    if (this.infiniteScroll) {
      this.infiniteScroll.disabled = true;
    }
    this.searchSub = this.poService.searchOrders(term).subscribe({
      next: (orders) => {
        this.isSearching = false;
        this.filteredOrders = orders;
      },
      error: () => {
        this.isSearching = false;
        this.searchFailed = true;
      }
    });
  }

  createOrder() {
    this.router.navigate(['/purchase-order/create']);
  }

  openDetail(poNumber: string) {
    this.router.navigate(['/purchase-order/detail', poNumber]);
  }

  doRefresh(event: CustomEvent) {
    this.orders = [];
    this.totalCount = 0;
    this.poService.getOrderHeaders(0, false).subscribe({
      next: (res) => {
        this.loadFailed = false;
        this.orders = this.deduplicate(res.value);
        this.totalCount = res['@odata.count'] ?? res.value.length;
        (event.target as HTMLIonRefresherElement).complete();
        // Re-runs an active search rather than replacing its results.
        this.handleSearch(this.searchTerm.trim());
      },
      error: async () => {
        (event.target as HTMLIonRefresherElement).complete();
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

  getStatusPillColor(status?: string): string {
    switch (status) {
      case 'Backorder':  return '#92400e';
      case 'Received':   return '#065f46';
      case 'Invoiced':   return '#4c1d95';
      case 'Canceled':   return '#991b1b';
      default:           return '#1e3a5f';
    }
  }

  getStatusPillBg(status?: string): string {
    switch (status) {
      case 'Backorder':  return 'rgba(217,119,6,.12)';
      case 'Received':   return 'rgba(16,185,129,.12)';
      case 'Invoiced':   return 'rgba(109,40,217,.12)';
      case 'Canceled':   return 'rgba(220,38,38,.12)';
      default:           return 'rgba(0,37,89,.10)';
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
