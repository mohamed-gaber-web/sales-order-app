import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ModalController, ToastController } from '@ionic/angular';
import { SalesOrderLineService, SalesOrderLineResponse } from '../../../../core/services/sales-order-line.service';
import { TransferJournalService } from '../../../../core/services/transfer-journal.service';
import { TransferJournalConfirmPayload, TransferJournalLine } from '../../../../models/transfer-journal.model';
import { ScannerModalComponent } from '../../scanner/scanner-modal.component';

interface TransferHeaderState {
  fromSiteId: string; fromSiteName: string;
  fromWarehouseId: string; fromWarehouseName: string;
  fromLocationId: string;
  toSiteId: string; toSiteName: string;
  toWarehouseId: string; toWarehouseName: string;
  toLocationId: string;
}

interface TransferCartItem {
  line: SalesOrderLineResponse;
  qty: number;
  remainingQty: number;
}

interface ConfirmedItem {
  itemNumber: string;
  productName?: string;
  lineNumber: number;
  qty: number;
  unit?: string;
}

@Component({
  selector: 'app-transfer-journal-scan',
  templateUrl: './transfer-journal-scan.page.html',
  styleUrls: ['./transfer-journal-scan.page.scss'],
  standalone: false,
})
export class TransferJournalScanPage implements OnInit {
  soNumber = '';
  header: TransferHeaderState = {
    fromSiteId: '', fromSiteName: '', fromWarehouseId: '', fromWarehouseName: '', fromLocationId: '',
    toSiteId: '', toSiteName: '', toWarehouseId: '', toWarehouseName: '', toLocationId: '',
  };

  searchTerm = '';
  showDropdown = false;
  isSearching = false;
  matches: SalesOrderLineResponse[] = [];

  showManualEntry = false;
  manualItemNumber = '';
  manualQty: number | null = null;

  isSubmitting = false;
  transferConfirmed = false;
  confirmedJournalNumber = '';
  confirmedItems: ConfirmedItem[] = [];
  confirmedTotalQty = 0;

  private cartMap = new Map<number, TransferCartItem>();
  private openLines: SalesOrderLineResponse[] = [];
  private linesLoaded = false;
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

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private lineService = inject(SalesOrderLineService);
  private transferJournalService = inject(TransferJournalService);

  private safeNum(val: unknown, fallback = 0): number {
    const n = Number(val);
    return isNaN(n) || n < 0 ? fallback : n;
  }

  getRemainingQty(line: SalesOrderLineResponse): number {
    const rem = Number(line.RemainingSalesPhysicalQuantity);
    if (!isNaN(rem) && rem >= 0) return rem;
    return this.safeNum(line.OrderedSalesQuantity);
  }

  isQtyValid(item: TransferCartItem): boolean {
    return item.qty > 0 && item.qty <= item.remainingQty;
  }

  ngOnInit() {
    this.soNumber = this.route.snapshot.paramMap.get('soNumber') ?? '';
    if (!this.soNumber) {
      this.router.navigate(['/inventory/transfer-journal']);
      return;
    }

    const state = history.state as Partial<TransferHeaderState>;
    if (!state?.fromWarehouseId || !state?.fromLocationId || !state?.toWarehouseId || !state?.toLocationId) {
      this.router.navigate(['/inventory/transfer-journal/from-to', this.soNumber]);
      return;
    }
    this.header = {
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

  /**
   * Ionic keeps this page alive in the nav stack, so ngOnInit only fires once.
   * "Transfer More Items" resets state in place on this same page — without invalidating
   * the cache, the next search would keep using pre-transfer remaining quantities.
   */
  ionViewWillEnter() {
    this.linesLoaded = false;
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

  private async runSearch(term: string, fromScan: boolean) {
    const seq = ++this.searchSeq;
    this.isSearching = true;
    this.showDropdown = true;
    try {
      if (!this.linesLoaded) {
        await this.loadOrderLines();
      }
      if (seq !== this.searchSeq) return; // stale — a newer search superseded this one

      const t = term.toLowerCase();
      const found = this.openLines.filter(line =>
        line.ItemNumber.toLowerCase().includes(t) ||
        (line.ProductName ?? '').toLowerCase().includes(t)
      );

      if (fromScan) {
        const exact = found.filter(line => line.ItemNumber.toLowerCase() === t);
        const candidates = exact.length > 0 ? exact : found;
        this.matches = candidates;
        if (candidates.length === 1) {
          this.showDropdown = false;
          this.addItem(candidates[0]);
          return;
        }
      } else {
        this.matches = found;
      }
    } catch {
      if (seq !== this.searchSeq) return;
      this.matches = [];
      const toast = await this.toastCtrl.create({
        message: `Could not load sales order ${this.soNumber}. Check your connection.`,
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      if (seq === this.searchSeq) this.isSearching = false;
    }
  }

  private loadOrderLines(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.lineService.getOrderLines(this.soNumber).subscribe({
        next: (res) => {
          this.openLines = res.value.filter(
            (l) => l.LineNumber != null && this.getRemainingQty(l) > 0
          );
          this.linesLoaded = true;
          resolve();
        },
        error: (err) => reject(err instanceof Error ? err : new Error('Failed to load sales order')),
      });
    });
  }

  private buildCartItem(line: SalesOrderLineResponse, initialQty?: number): TransferCartItem {
    const remainingQty = this.getRemainingQty(line);
    const qty = initialQty && initialQty > 0 ? Math.min(initialQty, remainingQty) : remainingQty;
    return { line, qty, remainingQty };
  }

  async addItem(line: SalesOrderLineResponse, initialQty?: number) {
    this.showDropdown = false;
    this.clearSearch();

    const lineNumber = line.LineNumber as number;
    if (this.cartMap.has(lineNumber)) {
      const toast = await this.toastCtrl.create({
        message: `${line.ItemNumber} is already in your list below.`,
        duration: 2000,
        color: 'warning',
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    this.cartMap.set(lineNumber, this.buildCartItem(line, initialQty));
  }

  removeFromCart(item: TransferCartItem) {
    this.cartMap.delete(item.line.LineNumber as number);
  }

  clearCart() {
    this.cartMap.clear();
  }

  adjustQty(item: TransferCartItem, delta: number) {
    const next = Math.min(item.remainingQty, Math.max(0, item.qty + delta));
    item.qty = Math.round(next * 1000) / 1000;
  }

  setMaxQty(item: TransferCartItem) {
    item.qty = item.remainingQty;
  }

  clampQty(item: TransferCartItem) {
    const clamped = Math.min(item.remainingQty, Math.max(0, Number(item.qty) || 0));
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

    if (!this.linesLoaded) {
      try {
        await this.loadOrderLines();
      } catch {
        const toast = await this.toastCtrl.create({
          message: `Could not load sales order ${this.soNumber}. Check your connection.`,
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
        return;
      }
    }

    const match = this.openLines.find(l => l.ItemNumber.toLowerCase() === itemNum.toLowerCase());
    if (!match) {
      const toast = await this.toastCtrl.create({
        message: `"${itemNum}" is not an open line on sales order ${this.soNumber}.`,
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    await this.addItem(match, this.manualQty ?? undefined);
    this.showManualEntry = false;
    this.manualItemNumber = '';
    this.manualQty = null;
  }

  async confirmTransfer() {
    if (!this.canSubmit || this.isSubmitting) return;
    this.isSubmitting = true;

    const items = this.cart;
    const lines: TransferJournalLine[] = items.map((item) => ({
      soLineNumber: item.line.LineNumber as number,
      itemNumber: item.line.ItemNumber,
      itemName: item.line.ProductName,
      qty: item.qty,
      unitSymbol: item.line.SalesUnitSymbol,
    }));

    const payload: TransferJournalConfirmPayload = {
      salesOrderNumber: this.soNumber,
      dataAreaId: 'usmf',
      fromSiteId: this.header.fromSiteId,
      fromWarehouseId: this.header.fromWarehouseId,
      fromLocationId: this.header.fromLocationId,
      toSiteId: this.header.toSiteId,
      toWarehouseId: this.header.toWarehouseId,
      toLocationId: this.header.toLocationId,
      lines,
    };

    const loading = await this.loadingCtrl.create({
      message: 'Confirming transfer...',
      spinner: 'crescent',
    });
    await loading.present();

    this.transferJournalService.confirmTransfer(payload).subscribe({
      next: async (res) => {
        await loading.dismiss();
        this.isSubmitting = false;
        if (res.success) {
          this.confirmedJournalNumber = res.journalNumber ?? '';
          this.confirmedTotalQty = items.reduce((sum, i) => sum + i.qty, 0);
          this.confirmedItems = items.map((item) => ({
            itemNumber: item.line.ItemNumber,
            productName: item.line.ProductName,
            lineNumber: item.line.LineNumber as number,
            qty: item.qty,
            unit: item.line.SalesUnitSymbol,
          }));
          this.transferConfirmed = true;
          this.cartMap.clear();
        } else {
          const toast = await this.toastCtrl.create({
            message: res.errorMessage ? `Transfer failed: ${res.errorMessage}` : 'Transfer failed. Try again.',
            buttons: [{ text: 'Dismiss', role: 'cancel' }],
            color: 'danger',
            position: 'bottom',
          });
          await toast.present();
        }
      },
      error: async (err) => {
        await loading.dismiss();
        this.isSubmitting = false;
        const d365Message = err?.error?.Message ?? err?.error?.message ?? err?.message;
        const toast = await this.toastCtrl.create({
          message: d365Message
            ? `Transfer failed: ${d365Message}`
            : 'Transfer failed. Check your connection and try again.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  transferMore() {
    this.transferConfirmed = false;
    this.confirmedItems = [];
    this.linesLoaded = false;
  }

  changeLocations() {
    this.router.navigate(['/inventory/transfer-journal/from-to', this.soNumber]);
  }

  changeSo() {
    this.router.navigate(['/inventory/transfer-journal']);
  }

  clearSearch() {
    this.searchTerm = '';
    this.matches = [];
    this.showDropdown = false;
  }
}
