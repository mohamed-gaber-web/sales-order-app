import { Component, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { IonInfiniteScroll, ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SalesShipmentService, SS_PAGE_SIZE } from '../../../../core/services/sales-shipment.service';
import { SalesShipmentHeader } from '../../../../models/inventory.model';

@Component({
  selector: 'app-sales-shipment-list',
  templateUrl: './sales-shipment-list.page.html',
  styleUrls: ['./sales-shipment-list.page.scss'],
  standalone: false,
})
export class SalesShipmentListPage {
  @ViewChild(IonInfiniteScroll) infiniteScroll!: IonInfiniteScroll;

  orders: SalesShipmentHeader[] = [];
  allOrders: SalesShipmentHeader[] = [];
  filteredOrders: SalesShipmentHeader[] = [];
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
    private shipmentService: SalesShipmentService,
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
    this.shipmentService.getShippableOrders(0).subscribe({
      next: res => {
        this.orders = res.value;
        this.filteredOrders = [...this.orders];
        this.totalCount = res['@odata.count'] ?? res.value.length;
        this.isLoading = false;
        if (this.infiniteScroll) this.infiniteScroll.disabled = !this.hasMore;
      },
      error: async () => {
        this.isLoading = false;
        const t = await this.toastCtrl.create({ message: 'Could not load sales orders.', duration: 3000, color: 'danger', position: 'bottom' });
        await t.present();
      }
    });
  }

  loadMore(event: CustomEvent) {
    if (!this.hasMore) { (event.target as HTMLIonInfiniteScrollElement).complete(); return; }
    this.isLoadingMore = true;
    this.shipmentService.getShippableOrders(this.orders.length).subscribe({
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
    if (!term) { this.filteredOrders = [...this.orders]; if (this.infiniteScroll) this.infiniteScroll.disabled = !this.hasMore; return; }
    if (this.allDataLoaded) { this.filterLocally(term); return; }
    this.isSearching = true;
    this.shipmentService.getAllShippableOrders().subscribe({
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
      (o.SalesOrderNumber ?? '').toLowerCase().includes(t) ||
      (o.CustomerAccountNumber ?? '').toLowerCase().includes(t) ||
      (o.CustomerName ?? '').toLowerCase().includes(t)
    );
  }

  openShip(soNumber: string) {
    this.router.navigate(['/inventory/sales-shipment/ship', soNumber]);
  }

  doRefresh(event: CustomEvent) {
    this.allDataLoaded = false;
    this.allOrders = [];
    this.loadOrders();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1000);
  }
}
