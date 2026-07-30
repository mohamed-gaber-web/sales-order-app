import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { ModalController, ToastController } from '@ionic/angular';
import { VanSalesService } from '../../../../core/services/van-sales.service';
import { VanCartService } from '../../../../core/services/van-cart.service';
import { VanProduct } from '../../../../models/van-sales.model';
import { ScannerModalComponent } from '../../scanner/scanner-modal.component';

type CatalogueTab = 'sellable' | 'all';

@Component({
  selector: 'app-van-sales-catalog',
  templateUrl: './van-sales-catalog.page.html',
  styleUrls: ['./van-sales-catalog.page.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VanSalesCatalogPage implements OnInit {
  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private vanSales = inject(VanSalesService);
  readonly cart = inject(VanCartService);

  readonly tab = signal<CatalogueTab>('sellable');
  readonly searchTerm = signal('');
  readonly justScanned = signal<string | null>(null);

  readonly isLoading = signal(true);
  readonly isLoadingMore = signal(false);
  readonly isSearching = signal(false);
  readonly loadFailed = signal(false);

  /**
   * Server pages accumulated for the active tab. Nothing is ever fetched whole —
   * each scroll issues its own `$top`/`$skip` request.
   */
  private readonly loaded = signal<VanProduct[]>([]);
  private readonly total = signal(0);

  /** Results of the current search, which bypasses paging entirely. */
  private readonly searchResults = signal<VanProduct[]>([]);

  /** Cached per-tab so switching back doesn't re-request page 1. */
  private readonly pagesByTab = new Map<CatalogueTab, { items: VanProduct[]; total: number }>();

  private searchSeq = 0;

  readonly sellableCount = computed(() =>
    this.tab() === 'sellable' ? this.total() : (this.pagesByTab.get('sellable')?.total ?? 0)
  );

  /** Cards currently on screen. */
  readonly visible = computed(() =>
    this.searchTerm().trim() ? this.searchResults() : this.loaded()
  );

  /** Total matching the current view, for the result counter. */
  readonly totalForView = computed(() =>
    this.searchTerm().trim() ? this.searchResults().length : this.total()
  );

  /** Search returns its whole result set, so only paged browsing can grow. */
  readonly hasMore = computed(
    () => !this.searchTerm().trim() && this.loaded().length < this.total()
  );

  /** Shown the first time the driver searches, which is what pulls the match list. */
  readonly isBuildingIndex = computed(() => {
    if (!this.isSearching()) return false;
    return this.tab() === 'all'
      ? !this.vanSales.isSearchIndexReady
      : !this.vanSales.isSellableIndexReady;
  });

  ngOnInit() {
    this.loadFirstPage();
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  /** Requests one server page for the active tab. */
  private fetchPage(skip: number) {
    return this.tab() === 'sellable'
      ? this.vanSales.getSellablePage(skip)
      : this.vanSales.getAllPage(skip);
  }

  private loadFirstPage(done?: () => void) {
    this.isLoading.set(true);
    this.loadFailed.set(false);
    const tab = this.tab();

    this.fetchPage(0).subscribe({
      next: (page) => {
        if (this.tab() !== tab) return; // the driver switched tabs mid-flight
        this.loaded.set(page.items);
        this.total.set(page.total);
        this.pagesByTab.set(tab, { items: page.items, total: page.total });
        this.isLoading.set(false);
        done?.();
      },
      error: () => {
        if (this.tab() !== tab) return;
        this.loaded.set([]);
        this.total.set(0);
        this.isLoading.set(false);
        this.loadFailed.set(true);
        done?.();
      },
    });
  }

  /** Infinite scroll — one `$top`/`$skip` request per page, ~9 KB each. */
  loadMore(event: CustomEvent) {
    const complete = () => (event.target as HTMLIonInfiniteScrollElement).complete();

    if (!this.hasMore() || this.isLoadingMore()) {
      complete();
      return;
    }

    const tab = this.tab();
    this.isLoadingMore.set(true);

    this.fetchPage(this.loaded().length).subscribe({
      next: (page) => {
        this.isLoadingMore.set(false);
        complete();
        if (this.tab() !== tab) return;
        const merged = [...this.loaded(), ...page.items];
        this.loaded.set(merged);
        this.total.set(page.total);
        this.pagesByTab.set(tab, { items: merged, total: page.total });
      },
      error: async () => {
        this.isLoadingMore.set(false);
        complete();
        await this.toast('Could not load more products. Check your connection.', 'danger');
      },
    });
  }

  retry() {
    this.loadFirstPage();
  }

  handleRefresh(event: CustomEvent) {
    const complete = () => (event.target as HTMLIonRefresherElement).complete();
    this.vanSales.invalidate();
    this.pagesByTab.clear();
    this.searchResults.set([]);
    this.loadFirstPage(complete);
  }

  // ── Search & tabs ──────────────────────────────────────────────────────────

  onSearch(term: string) {
    this.searchTerm.set(term);
    this.justScanned.set(null);
    this.runSearch(term);
  }

  clearSearch() {
    this.onSearch('');
  }

  /**
   * Search can't be paged or pushed to the server — this tenant rejects every
   * OData string function — so it resolves against a list fetched on first use
   * and cached for the session. Browsing and scanning never trigger it.
   */
  private runSearch(term: string) {
    const trimmed = term.trim();
    const seq = ++this.searchSeq;

    if (!trimmed) {
      this.searchResults.set([]);
      this.isSearching.set(false);
      return;
    }

    this.isSearching.set(true);
    const tab = this.tab();
    const search$ =
      tab === 'sellable'
        ? this.vanSales.searchSellable(trimmed)
        : this.vanSales.searchAllProducts(trimmed);

    search$.subscribe({
      next: (found) => {
        if (seq !== this.searchSeq) return; // a newer search superseded this one
        this.searchResults.set(found);
        this.isSearching.set(false);
      },
      error: async () => {
        if (seq !== this.searchSeq) return;
        this.searchResults.set([]);
        this.isSearching.set(false);
        await this.toast('Could not search the catalogue. Check your connection.', 'danger');
      },
    });
  }

  setTab(next: CatalogueTab) {
    if (this.tab() === next) return;
    this.tab.set(next);

    const cached = this.pagesByTab.get(next);
    if (cached) {
      // Already paged through this tab once — restore it instead of re-requesting.
      this.loaded.set(cached.items);
      this.total.set(cached.total);
      this.isLoading.set(false);
      this.loadFailed.set(false);
    } else {
      this.loadFirstPage();
    }

    this.runSearch(this.searchTerm());
  }

  // ── Scanning ───────────────────────────────────────────────────────────────

  async scan() {
    const modal = await this.modalCtrl.create({
      component: ScannerModalComponent,
      cssClass: 'scanner-modal',
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();

    const { data } = await modal.onWillDismiss<string>();
    const code = data?.trim();
    if (code) this.resolveScan(code);
  }

  /**
   * One targeted `eq` lookup — scanning never waits on a catalogue page or the
   * search index. An exact hit goes straight into the cart, because the driver
   * already told us what they want by scanning it.
   */
  private resolveScan(code: string) {
    this.isSearching.set(true);
    this.vanSales.findByItemNumber(code).subscribe({
      next: async (product) => {
        this.isSearching.set(false);

        if (!product) {
          // Not an item number — fall back to treating it as a search term.
          this.onSearch(code);
          await this.toast(`No item numbered "${code}". Showing matches instead.`, 'danger');
          return;
        }

        if (!product.isSellable) this.tab.set('all');
        this.cart.add(product, 1);
        this.justScanned.set(product.itemNumber);

        // Show the scanned item on its own — the driver sees what matched and can
        // bump the quantity without hunting. Set directly rather than going
        // through runSearch, so a scan never pulls the search list.
        this.searchTerm.set(product.itemNumber);
        this.searchResults.set([product]);
        this.searchSeq++; // cancel any in-flight typed search

        await this.toast(
          `${product.itemNumber} added — ${this.cart.qtyOf(product.itemNumber)} in cart`,
          'success'
        );
      },
      error: async () => {
        this.isSearching.set(false);
        await this.toast(`Could not look up "${code}". Check your connection.`, 'danger');
      },
    });
  }

  // ── Cart actions ───────────────────────────────────────────────────────────

  add(product: VanProduct) {
    this.cart.add(product, 1);
    this.justScanned.set(null);
  }

  adjust(product: VanProduct, delta: number, event: Event) {
    event.stopPropagation();
    this.cart.adjustQty(product.itemNumber, delta);
  }

  goToCart() {
    this.router.navigate(['/inventory/van-sales/cart']);
  }

  // ── Tile presentation ──────────────────────────────────────────────────────

  /** Item numbers whose image URL failed to load. */
  private readonly brokenImages = signal<ReadonlySet<string>>(new Set());

  /** A dead URL falls back to the initial tile rather than a broken-image icon. */
  imageUrl(product: VanProduct): string | undefined {
    return this.brokenImages().has(product.itemNumber) ? undefined : product.imageUrl;
  }

  onImageError(product: VanProduct) {
    this.brokenImages.update((set) => new Set(set).add(product.itemNumber));
  }

  /** Up to two initials for the placeholder tile shown when a product has no image. */
  initials(product: VanProduct): string {
    const source = (product.name || product.itemNumber).replace(/[^A-Za-z0-9 ]/g, ' ').trim();
    const words = source.split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }

  /**
   * Stable hue per item number so a product keeps the same tile colour on every
   * visit — the driver navigates partly by colour once they know the catalogue.
   */
  tileHue(product: VanProduct): number {
    let hash = 0;
    const key = product.itemNumber;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
    return Math.abs(hash) % 360;
  }

  private async toast(message: string, color: 'success' | 'danger') {
    const toast = await this.toastCtrl.create({
      message,
      duration: color === 'success' ? 1600 : 3000,
      color,
      position: 'top',
      cssClass: 'van-toast',
    });
    await toast.present();
  }
}
