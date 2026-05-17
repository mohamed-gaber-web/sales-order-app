import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TransferShipmentService, TS_PAGE_SIZE } from '../../../../core/services/transfer-shipment.service';
import { TransferOrderHeader } from '../../../../models/transfer-order.model';

@Component({
  selector: 'app-transfer-ship-list',
  templateUrl: './transfer-ship-list.page.html',
  styleUrls: ['./transfer-ship-list.page.scss'],
  standalone: false,
})
export class TransferShipListPage {
  @ViewChild(IonInfiniteScroll) infiniteScroll!: IonInfiniteScroll;

  orders: TransferOrderHeader[] = [];
  filteredOrders: TransferOrderHeader[] = [];
  allOrders: TransferOrderHeader[] = [];
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
    private transferShipmentService: TransferShipmentService,
  ) {
    this.searchSubject
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(term => this.handleSearch(term));
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
    this.transferShipmentService.getShippableOrders(undefined, 0).subscribe({
      next: res => {
        this.orders = this.deduplicate(res.value);
        this.filteredOrders = [...this.orders];
        this.totalCount = (res as { '@odata.count'?: number })['@odata.count'] ?? res.value.length;
        this.isLoading = false;
        if (this.infiniteScroll) {
          this.infiniteScroll.disabled = !this.hasMore;
        }
      },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: 'Could not load transfer orders. Pull down to refresh.',
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  loadMore(event: CustomEvent) {
    if (!this.hasMore) {
      (event.target as HTMLIonInfiniteScrollElement).complete();
      return;
    }
    this.isLoadingMore = true;
    this.transferShipmentService.getShippableOrders(undefined, this.orders.length).subscribe({
      next: res => {
        this.orders = this.deduplicate([...this.orders, ...res.value]);
        this.filteredOrders = [...this.orders];
        this.isLoadingMore = false;
        (event.target as HTMLIonInfiniteScrollElement).complete();
        if (!this.hasMore && this.infiniteScroll) {
          this.infiniteScroll.disabled = true;
        }
      },
      error: async () => {
        this.isLoadingMore = false;
        (event.target as HTMLIonInfiniteScrollElement).complete();
        const toast = await this.toastCtrl.create({
          message: 'Could not load more orders.',
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  loadMoreWeb() {
    if (!this.hasMore || this.isLoadingMore) return;
    this.isLoadingMore = true;
    this.transferShipmentService.getShippableOrders(undefined, this.orders.length).subscribe({
      next: res => {
        this.orders = this.deduplicate([...this.orders, ...res.value]);
        this.filteredOrders = [...this.orders];
        this.isLoadingMore = false;
      },
      error: async () => {
        this.isLoadingMore = false;
        const toast = await this.toastCtrl.create({
          message: 'Could not load more orders.',
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
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
    // Load all pages for client-side search — batch via getShippableOrders with large skip not ideal;
    // instead fetch a generous first batch (skip=0, which returns up to TS_PAGE_SIZE) and filter locally.
    this.transferShipmentService.getShippableOrders(undefined, 0).subscribe({
      next: res => {
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
          message: 'Search failed. Try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  private filterLocally(term: string) {
    const t = term.toLowerCase();
    this.filteredOrders = this.allOrders.filter(
      o =>
        o.TransferOrderNumber.toLowerCase().includes(t) ||
        (o.ShippingWarehouseId ?? '').toLowerCase().includes(t) ||
        (o.ReceivingWarehouseId ?? '').toLowerCase().includes(t),
    );
  }

  openShip(toNumber: string) {
    this.router.navigate(['/inventory/transfer-ship/ship', toNumber]);
  }

  doRefresh(event: CustomEvent) {
    this.allDataLoaded = false;
    this.allOrders = [];
    this.orders = [];
    this.totalCount = 0;
    this.transferShipmentService.getShippableOrders(undefined, 0).subscribe({
      next: res => {
        this.orders = this.deduplicate(res.value);
        this.filteredOrders = [...this.orders];
        this.totalCount = (res as { '@odata.count'?: number })['@odata.count'] ?? res.value.length;
        (event.target as HTMLIonRefresherElement).complete();
        if (this.infiniteScroll) {
          this.infiniteScroll.disabled = !this.hasMore;
        }
      },
      error: async () => {
        (event.target as HTMLIonRefresherElement).complete();
        const toast = await this.toastCtrl.create({
          message: 'Refresh failed. Try again.',
          duration: 3000,
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  private deduplicate(list: TransferOrderHeader[]): TransferOrderHeader[] {
    const seen = new Set<string>();
    return list.filter(o => {
      if (seen.has(o.TransferOrderNumber)) return false;
      seen.add(o.TransferOrderNumber);
      return true;
    });
  }

  getStatusStripColor(): string {
    return 'var(--gp-accent)';
  }

  protected readonly TS_PAGE_SIZE = TS_PAGE_SIZE;
}
