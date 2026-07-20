import { Component } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { InventoryService } from '../../../core/services/inventory.service';
import { InventoryOnHand } from '../../../models/inventory.model';

@Component({
  selector: 'app-inquiry-items',
  templateUrl: './inquiry-items.page.html',
  styleUrls: ['./inquiry-items.page.scss'],
  standalone: false,
})
export class InquiryItemsPage {
  warehouseId = '';
  items: InventoryOnHand[] = [];
  searchTerm = '';
  isLoading = false;
  isLoadingMore = false;
  totalCount = 0;

  private searchSubject = new Subject<string>();

  get hasMore(): boolean { return this.items.length < this.totalCount; }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private invService: InventoryService,
    private toastCtrl: ToastController,
  ) {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe(() => this.loadItems());
  }

  ionViewWillEnter() {
    this.warehouseId = this.route.snapshot.paramMap.get('warehouseId') ?? '';
    this.loadItems();
  }

  loadItems() {
    this.isLoading = true;
    this.items = [];
    this.totalCount = 0;
    this.fetchPage(0).subscribe({
      next: (res) => {
        this.items = res.value ?? [];
        this.totalCount = res['@odata.count'] ?? this.items.length;
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const t = await this.toastCtrl.create({
          message: 'Could not load inventory data.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
        });
        await t.present();
      }
    });
  }

  onSearchChange() {
    this.searchSubject.next(this.searchTerm.trim());
  }

  loadMore(event: CustomEvent) {
    if (!this.hasMore) { (event.target as HTMLIonInfiniteScrollElement).complete(); return; }
    this.isLoadingMore = true;
    this.fetchPage(this.items.length).subscribe({
      next: (res) => {
        this.items = [...this.items, ...(res.value ?? [])];
        this.isLoadingMore = false;
        (event.target as HTMLIonInfiniteScrollElement).complete();
      },
      error: () => {
        this.isLoadingMore = false;
        (event.target as HTMLIonInfiniteScrollElement).complete();
      }
    });
  }

  private fetchPage(skip: number) {
    const term = this.searchTerm.trim();
    return term
      ? this.invService.searchOnHand(term, this.warehouseId, skip)
      : this.invService.getOnHandByWarehouse(this.warehouseId);
  }

  doRefresh(event: CustomEvent) {
    this.loadItems();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1200);
  }

  getAvailableColor(qty?: number): string {
    if (!qty || qty <= 0) return 'danger';
    if (qty < 10) return 'warning';
    return 'success';
  }
}
