import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { ProductionIssueService } from '../../../../core/services/production-issue.service';

export interface ProductionOrder {
  ProductionOrderNumber: string;
  ItemNumber: string;
  ItemName?: string;
  OrderedQuantity: number;
  WarehouseId?: string;
  ProductionOrderStatus?: string;
  dataAreaId?: string;
}

@Component({
  selector: 'app-production-issue-list',
  templateUrl: './production-issue-list.page.html',
  styleUrls: ['./production-issue-list.page.scss'],
  standalone: false,
})
export class ProductionIssueListPage {
  @ViewChild(IonInfiniteScroll) infiniteScroll!: IonInfiniteScroll;

  orders: ProductionOrder[] = [];
  allOrders: ProductionOrder[] = [];
  filteredOrders: ProductionOrder[] = [];
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
    private productionIssueService: ProductionIssueService,
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
    this.productionIssueService.getOpenProductionOrders(0).subscribe({
      next: res => {
        this.orders = res.value;
        this.filteredOrders = [...this.orders];
        this.totalCount = res['@odata.count'] ?? res.value.length;
        this.isLoading = false;
        if (this.infiniteScroll) this.infiniteScroll.disabled = !this.hasMore;
      },
      error: async () => {
        this.isLoading = false;
        const t = await this.toastCtrl.create({ message: 'Could not load production orders.', duration: 3000, color: 'danger', position: 'bottom' });
        await t.present();
      }
    });
  }

  loadMore(event: CustomEvent) {
    if (!this.hasMore) { (event.target as HTMLIonInfiniteScrollElement).complete(); return; }
    this.isLoadingMore = true;
    this.productionIssueService.getOpenProductionOrders(this.orders.length).subscribe({
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

  onQueryChange(term: string) { this.searchTerm = term; this.searchSubject.next(term); }

  onSearchChange() { this.searchSubject.next(this.searchTerm.trim()); }

  private handleSearch(term: string) {
    if (!term) {
      this.filteredOrders = [...this.orders];
      if (this.infiniteScroll) this.infiniteScroll.disabled = !this.hasMore;
      return;
    }
    if (this.allDataLoaded) { this.filterLocally(term); return; }
    this.isSearching = true;
    this.productionIssueService.getAllProductionOrders().subscribe({
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
      (o.ProductionOrderNumber ?? '').toLowerCase().includes(t) ||
      (o.ItemNumber ?? '').toLowerCase().includes(t) ||
      (o.ItemName ?? '').toLowerCase().includes(t)
    );
  }

  openIssue(order: ProductionOrder) {
    this.router.navigate(
      ['/inventory/production-issue/issue', order.ProductionOrderNumber],
      {
        state: {
          itemNumber: order.ItemNumber,
          itemName: order.ItemName,
          orderedQuantity: order.OrderedQuantity,
          warehouseId: order.WarehouseId,
          dataAreaId: order.dataAreaId ?? 'usmf',
          status: order.ProductionOrderStatus,
        }
      }
    );
  }

  doRefresh(event: CustomEvent) {
    this.allDataLoaded = false;
    this.allOrders = [];
    this.loadOrders();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1000);
  }

  getStatusColor(status?: string): string {
    switch ((status ?? '').toLowerCase()) {
      case 'released': return '#16a34a';
      case 'started':  return '#d97706';
      case 'reported': return '#2563eb';
      default:         return '#6b7280';
    }
  }

  getStatusBg(status?: string): string {
    switch ((status ?? '').toLowerCase()) {
      case 'released': return 'rgba(22,163,74,.12)';
      case 'started':  return 'rgba(217,119,6,.12)';
      case 'reported': return 'rgba(37,99,235,.12)';
      default:         return 'rgba(107,114,128,.12)';
    }
  }
}
