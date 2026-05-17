import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { ToastController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { InventoryService, INV_PAGE_SIZE } from '../../../core/services/inventory.service';
import { InventoryOnHand } from '../../../models/inventory.model';

@Component({
  selector: 'app-on-hand',
  templateUrl: './on-hand.page.html',
  styleUrls: ['./on-hand.page.scss'],
  standalone: false,
})
export class OnHandPage {
  items: InventoryOnHand[] = [];
  searchTerm = '';
  isLoading = false;
  isLoadingMore = false;
  totalCount = 0;

  private searchSubject = new Subject<string>();

  get hasMore(): boolean {
    return this.items.length < this.totalCount;
  }

  constructor(
    private invService: InventoryService,
    private toastCtrl: ToastController,
    private router: Router,
  ) {
    this.searchSubject.pipe(
      debounceTime(400),
      distinctUntilChanged(),
    ).subscribe(term => this.performSearch(term));
  }

  ionViewWillEnter() {
    if (this.items.length === 0) this.loadItems();
  }

  loadItems() {
    this.isLoading = true;
    this.items = [];
    this.totalCount = 0;
    this.fetchData(0).subscribe({
      next: res => {
        this.items = res.value ?? [];
        this.totalCount = res['@odata.count'] ?? this.items.length;
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const t = await this.toastCtrl.create({
          message: 'Could not load on-hand data.',
          duration: 3000, color: 'danger', position: 'bottom',
        });
        await t.present();
      }
    });
  }

  onSearchChange() {
    this.searchSubject.next(this.searchTerm.trim());
  }

  private performSearch(term: string) {
    this.isLoading = true;
    this.items = [];
    this.totalCount = 0;
    this.fetchData(0, term).subscribe({
      next: res => {
        this.items = res.value ?? [];
        this.totalCount = res['@odata.count'] ?? this.items.length;
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const t = await this.toastCtrl.create({
          message: 'Search failed.',
          duration: 3000, color: 'danger', position: 'bottom',
        });
        await t.present();
      }
    });
  }

  private fetchData(skip: number, term?: string) {
    return term
      ? this.invService.searchOnHand(term, undefined, skip)
      : this.invService.getAllOnHand(skip);
  }

  loadMore(event: CustomEvent) {
    if (!this.hasMore) { (event.target as HTMLIonInfiniteScrollElement).complete(); return; }
    this.isLoadingMore = true;
    this.fetchData(this.items.length, this.searchTerm.trim() || undefined).subscribe({
      next: res => {
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

  refresh() {
    this.searchTerm = '';
    this.loadItems();
  }

  doRefresh(event: CustomEvent) {
    this.items = [];
    this.loadItems();
    setTimeout(() => (event.target as HTMLIonRefresherElement).complete(), 1200);
  }

  goBack() { this.router.navigate(['/inventory']); }

  getAvailableColor(qty?: number): string {
    if (qty === undefined || qty === null || qty <= 0) return 'danger';
    if (qty < 10) return 'warning';
    return 'success';
  }
}
