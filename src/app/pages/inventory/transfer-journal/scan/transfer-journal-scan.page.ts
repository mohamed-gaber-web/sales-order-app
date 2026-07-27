import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LoadingController, ModalController, ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';
import { TransferJournalService } from '../../../../core/services/transfer-journal.service';
import { InventoryProduct } from '../../../../models/inventory.model';
import { TransferJournalItem, TransferRoute } from '../../../../models/transfer-journal.model';
import { ScannerModalComponent } from '../../scanner/scanner-modal.component';

interface TransferCartItem {
  product: InventoryProduct;
  qty: number;
}

interface ConfirmedItem {
  itemNumber: string;
  productName?: string;
  qty: number;
}

const DEFAULT_QTY = 1;

@Component({
  selector: 'app-transfer-journal-scan',
  templateUrl: './transfer-journal-scan.page.html',
  styleUrls: ['./transfer-journal-scan.page.scss'],
  standalone: false,
})
export class TransferJournalScanPage implements OnInit {
  route: TransferRoute = {
    fromSiteId: '', fromSiteName: '', fromWarehouseId: '', fromWarehouseName: '', fromLocationId: '',
    toSiteId: '', toSiteName: '', toWarehouseId: '', toWarehouseName: '', toLocationId: '',
  };

  searchTerm = '';
  showDropdown = false;
  isSearching = false;
  matches: InventoryProduct[] = [];

  showManualEntry = false;
  manualItemNumber = '';
  manualQty: number | null = null;

  isSubmitting = false;
  journalCreated = false;
  confirmedJournalNumber = '';
  confirmedItems: ConfirmedItem[] = [];
  confirmedTotalQty = 0;

  private cartMap = new Map<string, TransferCartItem>();
  private searchSeq = 0;

  get cart(): TransferCartItem[] {
    return Array.from(this.cartMap.values());
  }

  get canSubmit(): boolean {
    return this.cart.length > 0 && this.cart.every((i) => this.isQtyValid(i));
  }

  get totalQty(): number {
    return this.cart.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
  }

  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private transferJournalService = inject(TransferJournalService);

  isQtyValid(item: TransferCartItem): boolean {
    return Number(item.qty) > 0;
  }

  ngOnInit() {
    const state = history.state as Partial<TransferRoute>;
    if (!state?.fromWarehouseId || !state?.fromLocationId || !state?.toWarehouseId || !state?.toLocationId) {
      this.router.navigate(['/inventory/transfer-journal']);
      return;
    }
    this.route = {
      fromSiteId: state.fromSiteId ?? '',
      fromSiteName: state.fromSiteName ?? '',
      fromWarehouseId: state.fromWarehouseId,
      fromWarehouseName: state.fromWarehouseName ?? '',
      fromLocationId: state.fromLocationId,
      toSiteId: state.toSiteId ?? '',
      toSiteName: state.toSiteName ?? '',
      toWarehouseId: state.toWarehouseId,
      toWarehouseName: state.toWarehouseName ?? '',
      toLocationId: state.toLocationId,
    };
  }

  // ── Product search (live autocomplete on the search field) ────
  onSearchInput(term: string) {
    this.searchTerm = term;
    const trimmed = term.trim();
    if (trimmed.length < 2) {
      this.matches = [];
      this.showDropdown = false;
      this.isSearching = false;
      return;
    }
    this.runSearch(trimmed, false);
  }

  onSearchBlur() {
    // Delay so a tap on a result registers before the list hides
    setTimeout(() => (this.showDropdown = false), 200);
  }

  closeDropdown() {
    this.showDropdown = false;
  }

  async scanItem() {
    const modal = await this.modalCtrl.create({
      component: ScannerModalComponent,
      cssClass: 'scanner-modal',
      breakpoints: [0, 0.75, 1],
      initialBreakpoint: 0.75,
    });
    await modal.present();
    const { data } = await modal.onWillDismiss<string>();
    const value = data?.trim();
    if (value) {
      this.searchTerm = value;
      await this.runSearch(value, true);
    }
  }

  private async runSearch(term: string, fromScan: boolean) {
    const seq = ++this.searchSeq;
    this.isSearching = true;
    this.showDropdown = true;
    try {
      const found = await firstValueFrom(this.transferJournalService.searchProducts(term));
      if (seq !== this.searchSeq) return; // stale — a newer search superseded this one

      if (fromScan) {
        const t = term.toLowerCase();
        const exact = found.filter((p) => p.ProductNumber.toLowerCase() === t);
        const candidates = exact.length > 0 ? exact : found;
        this.matches = candidates;
        if (candidates.length === 1) {
          this.showDropdown = false;
          await this.addItem(candidates[0]);
          return;
        }
      } else {
        this.matches = found;
      }
    } catch {
      if (seq !== this.searchSeq) return;
      this.matches = [];
      await this.showToast('Could not search products. Check your connection.');
    } finally {
      if (seq === this.searchSeq) this.isSearching = false;
    }
  }

  /** A repeat scan of the same item adds to its quantity rather than rejecting it. */
  async addItem(product: InventoryProduct, initialQty?: number) {
    this.showDropdown = false;
    this.clearSearch();

    const qty = initialQty && initialQty > 0 ? initialQty : DEFAULT_QTY;
    const existing = this.cartMap.get(product.ProductNumber);
    if (existing) {
      existing.qty = Math.round((existing.qty + qty) * 1000) / 1000;
      const toast = await this.toastCtrl.create({
        message: `${product.ProductNumber} is already listed — quantity is now ${existing.qty}.`,
        duration: 2000,
        color: 'warning',
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    this.cartMap.set(product.ProductNumber, { product, qty });
  }

  removeFromCart(item: TransferCartItem) {
    this.cartMap.delete(item.product.ProductNumber);
  }

  clearCart() {
    this.cartMap.clear();
  }

  adjustQty(item: TransferCartItem, delta: number) {
    const next = Math.max(0, (Number(item.qty) || 0) + delta);
    item.qty = Math.round(next * 1000) / 1000;
  }

  clampQty(item: TransferCartItem) {
    const clamped = Math.max(0, Number(item.qty) || 0);
    item.qty = Math.round(clamped * 1000) / 1000;
  }

  toggleManualEntry() {
    this.showManualEntry = !this.showManualEntry;
    this.manualItemNumber = '';
    this.manualQty = null;
  }

  async addManualItem() {
    const itemNum = this.manualItemNumber.trim();
    if (!itemNum) return;

    let product: InventoryProduct | undefined;
    try {
      product = await firstValueFrom(this.transferJournalService.getProductByNumber(itemNum));
    } catch {
      await this.showToast('Could not look up that item. Check your connection.');
      return;
    }

    if (!product) {
      await this.showToast(`"${itemNum}" is not a product in D365.`);
      return;
    }

    await this.addItem(product, this.manualQty ?? undefined);
    this.showManualEntry = false;
    this.manualItemNumber = '';
    this.manualQty = null;
  }

  async createJournal() {
    if (!this.canSubmit || this.isSubmitting) return;
    this.isSubmitting = true;

    const cartItems = this.cart;
    const items: TransferJournalItem[] = cartItems.map((item) => ({
      itemNumber: item.product.ProductNumber,
      itemName: item.product.ProductName,
      qty: Number(item.qty),
    }));

    const loading = await this.loadingCtrl.create({
      message: 'Creating journal...',
      spinner: 'crescent',
    });
    await loading.present();

    this.transferJournalService.createTransferJournal({ route: this.route, items }).subscribe({
      next: async (res) => {
        await loading.dismiss();
        this.isSubmitting = false;
        if (res.success) {
          this.confirmedJournalNumber = res.journalNumber;
          this.confirmedTotalQty = items.reduce((sum, i) => sum + i.qty, 0);
          this.confirmedItems = cartItems.map((item) => ({
            itemNumber: item.product.ProductNumber,
            productName: item.product.ProductName,
            qty: Number(item.qty),
          }));
          this.journalCreated = true;
          this.cartMap.clear();
        } else {
          await this.showToast(res.errorMessage ?? 'Could not create the journal. Try again.');
        }
      },
      error: async () => {
        await loading.dismiss();
        this.isSubmitting = false;
        await this.showToast('Could not create the journal. Check your connection and try again.');
      },
    });
  }

  /** Same route, empty cart — the common case of moving several batches between two bins. */
  startAnother() {
    this.journalCreated = false;
    this.confirmedItems = [];
    this.confirmedJournalNumber = '';
  }

  changeLocations() {
    this.router.navigate(['/inventory/transfer-journal']);
  }

  clearSearch() {
    this.searchTerm = '';
    this.matches = [];
    this.showDropdown = false;
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      buttons: [{ text: 'Dismiss', role: 'cancel' }],
      color: 'danger',
      position: 'bottom',
    });
    await toast.present();
  }
}
