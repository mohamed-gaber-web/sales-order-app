import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { VendorReturnService } from '../../../../core/services/vendor-return.service';
import { PurchaseOrderHeader } from '../../../../models/purchase-order.model';

@Component({
  selector: 'app-vendor-returns-list',
  templateUrl: './vendor-returns-list.page.html',
  styleUrls: ['./vendor-returns-list.page.scss'],
  standalone: false,
})
export class VendorReturnsListPage {
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
    private vendorReturnService: VendorReturnService,
  ) {
    this.searchSubject.pipe(debounceTime(400), distinctUntilChanged()).subscribe(t => this.handleSearch(t));
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
    this.vendorReturnService.getEligibleOrders(0).subscribe({
      next: res => {
        this.orders = res.value;
        this.filteredOrders = [...this.orders];
        this.totalCount = res['@odata.count'] ?? res.value.length;
        this.isLoading = false;
        if (this.infiniteScroll) this.infiniteScroll.disabled = !this.hasMore;
      },
      error: async () => {
        this.isLoading = false;
        const t = await this.toastCtrl.create({ message: 'Could not load purchase orders.', duration: 3000, color: 'danger', position: 'bottom' });
        await t.present();
      }
    });
  }

  loadMore(event: CustomEvent) {
    if (!this.hasMore) { (event.target as HTMLIonInfiniteScrollElement).complete(); return; }
    this.isLoadingMore = true;
    this.vendorReturnService.getEligibleOrders(this.orders.length).subscribe({
      next: res => {
        this.orders = [...this.orders, ...res.value];
        this.filteredOrders = [...this.orders];
        this.isLoadingMore = false;
        (event.target as HTMLIonInfiniteScrollElement).complete();
        if (!this.hasMore && this.infiniteScroll) this.infiniteScroll.disabled = true;
      },
      error: async () => {
        this.isLoadingMore = false;
        (event.target as HTMLIonInfiniteScrollElement).complete();
      }
    });
  }

  onSearchChange() { this.searchSubject.next(this.searchTerm.trim()); }

  private handleSearch(term: string) {
    if (!term) {
      this.filteredOrders = [...this.orders];
      if (this.infiniteScroll) this.infiniteScroll.disabled = !this.hasMore;
      return;
    }
    if (this.allDataLoaded) { this.filterLocally(term); return; }
    this.isSearching = true;
    this.vendorReturnService.getAllEligibleOrders().subscribe({
      next: res => {
        this.allOrders = res.value;
        this.allDataLoaded = true;
        this.isSearching = false;
        this.filterLocally(term);
        if (this.infiniteScroll) this.infiniteScroll.disabled = true;
      },
      error: async () => {
        this.isSearching = false;
      }
    });
  }

  private filterLocally(term: string) {
    const t = term.toLowerCase();
    this.filteredOrders = this.allOrders.filter(o =>
      (o.PurchaseOrderNumber ?? '').toLowerCase().includes(t) ||
      (o.VendorAccountNumber ?? '').toLowerCase().includes(t) ||
      (o.OrderVendorAccountNumber ?? '').toLowerCase().includes(t)
    );
  }

  openReturn(poNumber: string) {
    this.router.navigate(['/inventory/vendor-returns/return', poNumber]);
  }

  doRefresh(event: CustomEvent) {
    this.allDataLoaded = false;
    this.allOrders = [];
    this.loadOrders();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1000);
  }

  getStatusColor(status?: string): string {
    switch ((status ?? '').toLowerCase()) {
      case 'received':  return '#16a34a';
      case 'confirmed': return '#2563eb';
      case 'invoiced':  return '#7c3aed';
      default:          return '#6b7280';
    }
  }

  getStatusBg(status?: string): string {
    switch ((status ?? '').toLowerCase()) {
      case 'received':  return 'rgba(22,163,74,.12)';
      case 'confirmed': return 'rgba(37,99,235,.12)';
      case 'invoiced':  return 'rgba(124,58,237,.12)';
      default:          return 'rgba(107,114,128,.12)';
    }
  }
}
