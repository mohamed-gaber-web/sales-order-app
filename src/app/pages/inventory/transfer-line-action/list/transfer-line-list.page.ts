import { Component, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonInfiniteScroll, ToastController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';
import { Observable, Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { TransferShipmentService } from '../../../../core/services/transfer-shipment.service';
import { ODataResponse } from '../../../../core/models/lookup.models';
import { TransferOrderHeader } from '../../../../models/transfer-order.model';
import { TransferLineAction } from '../../../../models/inventory.model';
import { TRANSFER_LINE_ACTIONS, TransferLineActionConfig } from '../transfer-line-action.config';

@Component({
  selector: 'app-transfer-line-list',
  templateUrl: './transfer-line-list.page.html',
  // Same screen as Transfer Receive, so the same styles.
  styleUrls: ['../../transfer-receive/list/transfer-receive-list.page.scss'],
  standalone: false,
})
export class TransferLineListPage {
  @ViewChild(IonInfiniteScroll) infiniteScroll!: IonInfiniteScroll;

  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private translate = inject(TranslateService);
  private transferShipmentService = inject(TransferShipmentService);

  readonly config: TransferLineActionConfig = TRANSFER_LINE_ACTIONS[
    inject(ActivatedRoute).snapshot.data['action'] as TransferLineAction
  ];

  orders: TransferOrderHeader[] = [];
  filteredOrders: TransferOrderHeader[] = [];
  private allOrders: TransferOrderHeader[] = [];
  private allDataLoaded = false;
  searchTerm = '';
  isLoading = false;
  isLoadingMore = false;
  isSearching = false;
  totalCount = 0;

  private searchSubject = new Subject<string>();

  get hasMore(): boolean {
    return !this.searchTerm.trim() && this.orders.length < this.totalCount;
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

  private fetch(skip: number): Observable<ODataResponse<TransferOrderHeader>> {
    return this.config.side === 'ship'
      ? this.transferShipmentService.getShippableOrders(undefined, skip)
      : this.transferShipmentService.getReceivableOrders(undefined, skip);
  }

  loadOrders(onDone?: () => void) {
    this.isLoading = !onDone;
    this.fetch(0).subscribe({
      next: res => {
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
    this.fetch(this.orders.length).subscribe({
      next: res => {
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
    this.fetch(0).subscribe({
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
        o.TransferOrderNumber.toLowerCase().includes(t) ||
        (o.ShippingWarehouseId ?? '').toLowerCase().includes(t) ||
        (o.ReceivingWarehouseId ?? '').toLowerCase().includes(t),
    );
  }

  openOrder(toNumber: string) {
    this.router.navigate(['/inventory', this.config.path, toNumber]);
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

  private deduplicate(list: TransferOrderHeader[]): TransferOrderHeader[] {
    const seen = new Set<string>();
    return list.filter(o => {
      if (seen.has(o.TransferOrderNumber)) return false;
      seen.add(o.TransferOrderNumber);
      return true;
    });
  }
}
