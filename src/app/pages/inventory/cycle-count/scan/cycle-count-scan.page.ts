import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, LoadingController, ModalController, ToastController } from '@ionic/angular';
import { forkJoin } from 'rxjs';
import { CycleCountService, CYCLE_COUNT_JOURNAL_NAME } from '../../../../core/services/cycle-count.service';
import { InventoryService } from '../../../../core/services/inventory.service';
import { CycleCountLabelData } from '../../../../core/services/pdf.service';
import {
  InventoryProduct,
  CountCartItem,
  CycleCountJournalHeader,
  CycleCountJournalLine,
} from '../../../../models/inventory.model';
import { ScannerModalComponent } from '../../scanner/scanner-modal.component';
import { CycleCountLabelModalComponent } from '../label-preview/cycle-count-label-modal.component';

interface CountHeaderState {
  siteId: string;
  warehouseId: string;
  description: string;
  countedBy: string;
}

interface ConfirmedItem {
  itemNumber: string;
  productName?: string;
  qty: number;
}

@Component({
  selector: 'app-cycle-count-scan',
  templateUrl: './cycle-count-scan.page.html',
  styleUrls: ['./cycle-count-scan.page.scss'],
  standalone: false,
})
export class CycleCountScanPage implements OnInit {
  private readonly dataAreaId = 'usmf';

  header: CountHeaderState = { siteId: '', warehouseId: '', description: '', countedBy: '' };

  searchTerm = '';
  showDropdown = false;
  isSearching = false;
  matches: InventoryProduct[] = [];

  showManualEntry = false;
  manualItemNumber = '';
  manualQty: number | null = null;

  isSubmitting = false;
  countConfirmed = false;
  confirmedJournalNumber = '';
  confirmedItems: ConfirmedItem[] = [];
  confirmedTotalQty = 0;

  private cartMap = new Map<string, CountCartItem>();
  private searchSeq = 0;

  get cart(): CountCartItem[] {
    return Array.from(this.cartMap.values());
  }

  get canSubmit(): boolean {
    return this.cart.length > 0 && this.cart.every((i) => this.isQtyValid(i));
  }

  get totalQty(): number {
    return this.cart.reduce((sum, i) => sum + (Number(i.countedQty) || 0), 0);
  }

  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private actionSheetCtrl = inject(ActionSheetController);
  private inventoryService = inject(InventoryService);
  private cycleCountService = inject(CycleCountService);

  isQtyValid(item: CountCartItem): boolean {
    return item.countedQty >= 0;
  }

  ngOnInit() {
    const state = history.state as Partial<CountHeaderState>;
    if (!state?.siteId || !state?.warehouseId) {
      this.router.navigate(['/inventory/cycle-count/count-by-barcode']);
      return;
    }
    this.header = {
      siteId: state.siteId,
      warehouseId: state.warehouseId,
      description: state.description ?? '',
      countedBy: state.countedBy ?? '',
    };
  }

  // ── Item search (live autocomplete on the search field) ────
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

  private runSearch(term: string, fromScan: boolean) {
    const seq = ++this.searchSeq;
    this.isSearching = true;
    this.showDropdown = true;

    this.inventoryService.searchProducts(term, 20).subscribe({
      next: (found) => {
        if (seq !== this.searchSeq) return; // stale — a newer search superseded this one

        if (fromScan) {
          const t = term.toLowerCase();
          const exact = found.filter(p => p.ProductNumber.toLowerCase() === t);
          const candidates = exact.length > 0 ? exact : found;
          this.matches = candidates;
          if (candidates.length === 1) {
            this.showDropdown = false;
            this.addItem(candidates[0]);
            this.isSearching = false;
            return;
          }
        } else {
          this.matches = found;
        }
        this.isSearching = false;
      },
      error: async () => {
        if (seq !== this.searchSeq) return;
        this.matches = [];
        this.isSearching = false;
        const toast = await this.toastCtrl.create({
          message: 'Could not search items. Check your connection.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  async addItem(product: InventoryProduct, initialQty?: number) {
    this.showDropdown = false;
    this.clearSearch();

    if (this.cartMap.has(product.ProductNumber)) {
      const toast = await this.toastCtrl.create({
        message: `${product.ProductNumber} is already in your count list below.`,
        duration: 2000,
        color: 'warning',
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    const countedQty = initialQty !== undefined && initialQty >= 0 ? initialQty : 1;
    this.cartMap.set(product.ProductNumber, { product, countedQty });
  }

  removeFromCart(item: CountCartItem) {
    this.cartMap.delete(item.product.ProductNumber);
  }

  clearCart() {
    this.cartMap.clear();
  }

  adjustQty(item: CountCartItem, delta: number) {
    item.countedQty = Math.max(0, item.countedQty + delta);
  }

  clampQty(item: CountCartItem) {
    item.countedQty = Math.max(0, Number(item.countedQty) || 0);
  }

  toggleManualEntry() {
    this.showManualEntry = !this.showManualEntry;
    this.manualItemNumber = '';
    this.manualQty = null;
  }

  async addManualItem() {
    const itemNum = this.manualItemNumber.trim();
    if (!itemNum) return;

    this.inventoryService.getProductByNumber(itemNum).subscribe({
      next: async (res) => {
        const product = res.value[0];
        if (!product) {
          const toast = await this.toastCtrl.create({
            message: `"${itemNum}" is not a known item.`,
            buttons: [{ text: 'Dismiss', role: 'cancel' }],
            color: 'danger',
            position: 'bottom',
          });
          await toast.present();
          return;
        }

        await this.addItem(product, this.manualQty ?? undefined);
        this.showManualEntry = false;
        this.manualItemNumber = '';
        this.manualQty = null;
      },
      error: async () => {
        const toast = await this.toastCtrl.create({
          message: `Could not look up "${itemNum}". Check your connection.`,
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  async submitCount() {
    if (!this.canSubmit || this.isSubmitting) return;
    this.isSubmitting = true;

    const loading = await this.loadingCtrl.create({
      message: 'Creating count journal...',
      spinner: 'crescent'
    });
    await loading.present();

    this.createJournal(loading);
  }

  private createJournal(loading: HTMLIonLoadingElement) {
    const headerBody: Partial<CycleCountJournalHeader> = {
      dataAreaId: this.dataAreaId,
      JournalNameId: CYCLE_COUNT_JOURNAL_NAME,
      Description: this.header.description || 'Cycle count — created via mobile',
      WorkerPersonnelNumber: this.header.countedBy || undefined,
    };

    this.cycleCountService.createJournal(headerBody).subscribe({
      next: async (created) => {
        const journalNumber = created?.JournalNumber;
        if (!journalNumber) {
          await loading.dismiss();
          this.isSubmitting = false;
          const toast = await this.toastCtrl.create({
            message: 'D365 created the journal but returned no journal number, so the counted items were not saved.',
            buttons: [{ text: 'Dismiss', role: 'cancel' }],
            color: 'danger',
            position: 'bottom',
          });
          await toast.present();
          return;
        }
        this.createLines(journalNumber, loading);
      },
      error: async (err) => {
        await loading.dismiss();
        this.isSubmitting = false;
        const msg = this.extractErrorMessage(err);
        const toast = await this.toastCtrl.create({
          message: msg ? `Could not create count: ${msg}` : 'Could not create count. Try again.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      }
    });
  }

  /** Lines go to their own entity — the header entity rejects them as nested data. */
  private createLines(journalNumber: string, loading: HTMLIonLoadingElement) {
    const items = this.cart;
    const creates: Partial<CycleCountJournalLine>[] = items.map((item, i) => ({
      dataAreaId: this.dataAreaId,
      JournalNumber: journalNumber,
      LineNumber: i + 1,
      ItemNumber: item.product.ProductNumber,
      InventorySiteId: this.header.siteId,
      WarehouseId: this.header.warehouseId,
      CountedQuantity: item.countedQty,
    }));

    forkJoin(creates.map(line => this.cycleCountService.createJournalLine(line))).subscribe({
      next: async () => {
        await loading.dismiss();
        this.isSubmitting = false;
        this.confirmedJournalNumber = journalNumber;
        this.confirmedTotalQty = items.reduce((sum, i) => sum + i.countedQty, 0);
        this.confirmedItems = items.map(item => ({
          itemNumber: item.product.ProductNumber,
          productName: item.product.ProductName,
          qty: item.countedQty,
        }));
        this.countConfirmed = true;
        this.cartMap.clear();
      },
      error: async (err) => {
        await loading.dismiss();
        this.isSubmitting = false;
        const msg = this.extractErrorMessage(err);
        const toast = await this.toastCtrl.create({
          message: (msg ? `Some items failed to save: ${msg}. ` : 'Some items failed to save. ')
            + `Journal ${journalNumber} was created — open it to check what saved and add the rest.`,
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      }
    });
  }

  private extractErrorMessage(err: unknown): string {
    const e = err as { error?: { error?: { message?: string }; Message?: string; message?: string }; message?: string };
    return e?.error?.error?.message ?? e?.error?.Message ?? e?.error?.message ?? e?.message ?? '';
  }

  countMore() {
    this.countConfirmed = false;
    this.confirmedItems = [];
  }

  viewJournal() {
    this.router.navigate(['/inventory/cycle-count/detail', this.confirmedJournalNumber]);
  }

  async printLabel() {
    if (this.confirmedItems.length === 0) return;

    if (this.confirmedItems.length === 1) {
      await this.openLabelPreview(this.confirmedItems[0]);
      return;
    }

    const actionSheet = await this.actionSheetCtrl.create({
      header: 'Print label for…',
      buttons: [
        ...this.confirmedItems.map((item) => ({
          text: `${item.itemNumber} — ${item.qty}`,
          icon: 'pricetag-outline',
          handler: () => this.openLabelPreview(item)
        })),
        {
          text: 'Cancel',
          icon: 'close-outline',
          role: 'cancel'
        }
      ]
    });
    await actionSheet.present();
  }

  private async openLabelPreview(item: ConfirmedItem) {
    const modal = await this.modalCtrl.create({
      component: CycleCountLabelModalComponent,
      componentProps: { labelData: this.buildLabelData(item) },
      cssClass: 'label-preview-modal',
      breakpoints: [0, 0.9],
      initialBreakpoint: 0.9,
    });
    await modal.present();
  }

  private buildLabelData(item: ConfirmedItem): CycleCountLabelData {
    return {
      itemNumber: item.itemNumber,
      productName: item.productName,
      qty: item.qty,
      journalNumber: this.confirmedJournalNumber,
      warehouseId: this.header.warehouseId,
      countDate: new Date(),
    };
  }

  clearSearch() {
    this.searchTerm = '';
    this.matches = [];
    this.showDropdown = false;
  }

  changeLocation() {
    this.router.navigate(['/inventory/cycle-count/count-by-barcode']);
  }
}
