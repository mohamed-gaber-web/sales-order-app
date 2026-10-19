import { Component, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonInfiniteScroll, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { Observable, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { SalesOrderService } from '../../../../core/services/sales-order.service';
import { ODataResponse } from '../../../../core/models/lookup.models';
import { SalesLineAction, SalesOrderHeaderResponse } from '../../../../models/sales-order.model';
import { SALES_LINE_ACTIONS, SalesLineActionConfig } from '../sales-line-action.config';

@Component({
  selector: 'app-sales-line-list',
  templateUrl: './sales-line-list.page.html',
  // Same list layout as the transfer line actions.
  styleUrls: ['../../../inventory/transfer-receive/list/transfer-receive-list.page.scss'],
  standalone: false,
})
export class SalesLineListPage {
  @ViewChild(IonInfiniteScroll) infiniteScroll!: IonInfiniteScroll;

  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private translate = inject(TranslateService);
  private salesOrderService = inject(SalesOrderService);

  readonly config: SalesLineActionConfig = SALES_LINE_ACTIONS[
    inject(ActivatedRoute).snapshot.data['action'] as SalesLineAction
  ];

  orders: SalesOrderHeaderResponse[] = [];
  filteredOrders: SalesOrderHeaderResponse[] = [];
  private allOrders: SalesOrderHeaderResponse[] = [];
  private allDataLoaded = false;
  searchTerm = '';
  isLoading = false;
  isLoadingMore = false;
  isSearching = false;
  totalCount = 0;
  // GP_SalesHeaderAndLineData repeats the header once per line, so a page of
  // rows holds fewer orders than its size, and $count counts rows. Page by rows.
  private rowsLoaded = 0;

  private searchSubject = new Subject<string>();

  get hasMore(): boolean {
    return !this.searchTerm.trim() && this.rowsLoaded < this.totalCount;
  }

  constructor() {
    this.searchSubject
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(term => this.handleSearch(term));
  }

  ionViewWillEnter() {
    this.allDataLoaded = false;
    this.allOrders = [];
    this.loadOrders();
  }

  // Same query as the Sales Order list (or its return list, for registration).
  private fetch(skip: number): Observable<ODataResponse<SalesOrderHeaderResponse>> {
    return this.salesOrderService.getOrderHeaders(skip, this.config.returnsOnly);
  }

  loadOrders(onDone?: () => void) {
    this.isLoading = !onDone;
    this.fetch(0).subscribe({
      next: res => {
        this.rowsLoaded = res.value.length;
        this.orders = this.deduplicate(res.value);
        this.filteredOrders = [...this.orders];
        this.totalCount = (res as { '@odata.count'?: number })['@odata.count'] ?? res.value.length;
        this.isLoading = false;
        onDone?.();
        if (this.infiniteScroll) this.infiniteScroll.disabled = !this.hasMore;
      },
      error: () => {
        this.isLoading = false;
        onDone?.();
        this.showError('msg.refreshFailed');
      },
    });
  }

  loadMore(event?: CustomEvent) {
    const complete = () => (event?.target as HTMLIonInfiniteScrollElement | undefined)?.complete();
    if (!this.hasMore || this.isLoadingMore) {
      complete();
      return;
    }
    this.isLoadingMore = true;
    this.fetch(this.rowsLoaded).subscribe({
      next: res => {
        this.rowsLoaded += res.value.length;
        this.orders = this.deduplicate([...this.orders, ...res.value]);
        this.filteredOrders = [...this.orders];
        this.isLoadingMore = false;
        complete();
      },
      error: () => {
        this.isLoadingMore = false;
        complete();
        this.showError('msg.loadMoreFailed');
      },
    });
  }

  doRefresh(event: CustomEvent) {
    this.allDataLoaded = false;
    this.allOrders = [];
    this.loadOrders(() => (event.target as HTMLIonRefresherElement).complete());
  }

  onSearchChange() {
    this.searchSubject.next(this.searchTerm.trim());
  }

  private handleSearch(term: string) {
    if (!term) {
      this.filteredOrders = [...this.orders];
      if (this.infiniteScroll) this.infiniteScroll.disabled = !this.hasMore;
      return;
    }
    if (this.allDataLoaded) {
      this.filterLocally(term);
      return;
    }
    this.isSearching = true;
    this.salesOrderService.getAllOrderHeaders(this.config.returnsOnly).subscribe({
      next: res => {
        this.allOrders = this.deduplicate(res.value);
        this.allDataLoaded = true;
        this.isSearching = false;
        this.filterLocally(term);
        if (this.infiniteScroll) this.infiniteScroll.disabled = true;
      },
      error: () => {
        this.isSearching = false;
        this.showError('msg.searchFailed');
      },
    });
  }

  private filterLocally(term: string) {
    const t = term.toLowerCase();
    this.filteredOrders = this.allOrders.filter(
      o =>
        o.SalesId.toLowerCase().includes(t) ||
        (o.CustAccount ?? '').toLowerCase().includes(t) ||
        (o.SalesTable_SalesName ?? '').toLowerCase().includes(t),
    );
  }

  openOrder(salesId: string) {
    this.router.navigate(['/sales-order', this.config.path, salesId]);
  }

  private async showError(key: string) {
    const toast = await this.toastCtrl.create({
      message: this.translate.instant(key),
      buttons: [{ text: this.translate.instant('common.dismiss'), role: 'cancel' }],
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }

  private deduplicate(list: SalesOrderHeaderResponse[]): SalesOrderHeaderResponse[] {
    const seen = new Set<string>();
    return list.filter(o => {
      if (seen.has(o.SalesId)) return false;
      seen.add(o.SalesId);
      return true;
    });
  }
}
