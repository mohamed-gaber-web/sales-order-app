import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, LoadingController, ModalController, ToastController } from '@ionic/angular';
import { ReportAsFinishedService } from '../../../../core/services/report-as-finished.service';
import { ProductionOrder, ReportAsFinishedLineResult } from '../../../../models/inventory.model';
import { FinishedGoodsLabelData } from '../../../../core/services/pdf.service';
import { ScannerModalComponent } from '../../scanner/scanner-modal.component';
import { FinishedGoodsLabelModalComponent } from '../label-preview/finished-goods-label-modal.component';

interface ReportCartItem {
  order: ProductionOrder;
  qty: number;
  remainingQty: number;
}

interface ConfirmedItem {
  productionOrderNumber: string;
  itemNumber: string;
  itemName?: string;
  qty: number;
  journalNumber?: string;
}

@Component({
  selector: 'app-report-as-finished-scan',
  templateUrl: './report-as-finished-scan.page.html',
  styleUrls: ['./report-as-finished-scan.page.scss'],
  standalone: false,
})
export class ReportAsFinishedScanPage {
  searchTerm = '';
  showDropdown = false;
  isSearching = false;
  matches: ProductionOrder[] = [];

  isSubmitting = false;
  reportConfirmed = false;
  confirmedCount = 0;
  confirmedItems: ConfirmedItem[] = [];
  confirmedTotalQty = 0;

  private orders: ProductionOrder[] = [];
  private cartMap = new Map<string, ReportCartItem>();
  private ordersLoaded = false;
  private searchSeq = 0;

  get cart(): ReportCartItem[] {
    return Array.from(this.cartMap.values());
  }

  get canSubmit(): boolean {
    return this.cart.length > 0 && this.cart.every((i) => this.isQtyValid(i));
  }

  get totalQty(): number {
    return this.cart.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
  }

  get confirmedJournalLabel(): string {
    const journals = [...new Set(this.confirmedItems.map(i => i.journalNumber).filter(Boolean))];
    if (journals.length === 0) return '—';
    return journals.length === 1 ? journals[0]! : `${journals.length} journals`;
  }

  private router = inject(Router);
  private modalCtrl = inject(ModalController);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private actionSheetCtrl = inject(ActionSheetController);
  private rafService = inject(ReportAsFinishedService);

  private safeNum(val: unknown, fallback = 0): number {
    const n = Number(val);
    return isNaN(n) || n < 0 ? fallback : n;
  }

  getRemainingQty(order: ProductionOrder): number {
    const rem = Number(order.RemainingQuantity);
    if (!isNaN(rem) && rem >= 0) return rem;
    return this.safeNum(order.OrderedQuantity);
  }

  isQtyValid(item: ReportCartItem): boolean {
    return item.qty > 0 && item.qty <= item.remainingQty;
  }

  /**
   * Orders are fetched on first search, not on load — the screen shows nothing until
   * you scan or search for one.
   */
  private loadOrders(): Promise<void> {
    if (this.ordersLoaded) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.rafService.getOpenProductionOrders().subscribe({
        next: (res) => {
          this.orders = res.value;
          this.ordersLoaded = true;
          resolve();
        },
        error: (err) => reject(err instanceof Error ? err : new Error('Failed to load production orders')),
      });
    });
  }

  // ── Search (live autocomplete) ──────────────────────────────
  onSearchInput(term: string) {
    this.searchTerm = term;
    const trimmed = term.trim();
    if (trimmed.length < 1) {
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

  async scanOrder() {
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

  /**
   * D365 rejects contains()/startswith() on the production order entity, so matching
   * runs in memory over the orders still open for reporting.
   */
  private async runSearch(term: string, fromScan: boolean) {
    const seq = ++this.searchSeq;
    this.isSearching = true;
    this.showDropdown = true;
    try {
      await this.loadOrders();
      if (seq !== this.searchSeq) return; // stale — a newer search superseded this one

      const t = term.toLowerCase();
      const found = this.orders.filter(o =>
        !this.cartMap.has(o.ProductionOrderNumber) &&
        (o.ProductionOrderNumber.toLowerCase().includes(t) || o.ItemNumber.toLowerCase().includes(t))
      );

      if (fromScan) {
        const exact = found.filter(o =>
          o.ProductionOrderNumber.toLowerCase() === t || o.ItemNumber.toLowerCase() === t
        );
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
        message: 'Could not load production orders. Check your connection.',
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
    } finally {
      if (seq === this.searchSeq) this.isSearching = false;
    }
  }

  async addItem(order: ProductionOrder) {
    this.showDropdown = false;
    this.clearSearch();

    if (this.cartMap.has(order.ProductionOrderNumber)) {
      const toast = await this.toastCtrl.create({
        message: `${order.ProductionOrderNumber} is already in your list below.`,
        duration: 2000,
        color: 'warning',
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    const remainingQty = this.getRemainingQty(order);
    this.cartMap.set(order.ProductionOrderNumber, { order, qty: remainingQty, remainingQty });
  }

  removeFromCart(item: ReportCartItem) {
    this.cartMap.delete(item.order.ProductionOrderNumber);
  }

  clearCart() {
    this.cartMap.clear();
  }

  adjustQty(item: ReportCartItem, delta: number) {
    // Clamp to 0 (not 0.001) so a decrement lands on a clean value instead of a
    // near-invisible sliver; landing on 0 trips the "must be greater than 0" validation.
    const next = Math.min(item.remainingQty, Math.max(0, item.qty + delta));
    item.qty = Math.round(next * 1000) / 1000;
  }

  setMaxQty(item: ReportCartItem) {
    item.qty = item.remainingQty;
  }

  clampQty(item: ReportCartItem) {
    const clamped = Math.min(item.remainingQty, Math.max(0, Number(item.qty) || 0));
    item.qty = Math.round(clamped * 1000) / 1000;
  }

  async submitReport() {
    if (!this.canSubmit || this.isSubmitting) return;
    this.isSubmitting = true;

    const items = this.cart;
    const itemNames = new Map(items.map(i => [i.order.ProductionOrderNumber, i.order.ItemName]));

    const loading = await this.loadingCtrl.create({
      message: items.length > 1 ? `Reporting ${items.length} orders...` : 'Reporting as finished...',
      spinner: 'crescent'
    });
    await loading.present();

    this.rafService.reportAsFinished({
      lines: items.map(i => ({
        dataAreaId: i.order.dataAreaId ?? 'usmf',
        productionOrderNumber: i.order.ProductionOrderNumber,
        itemNumber: i.order.ItemNumber,
        reportedQty: i.qty,
        locationId: i.order.LocationId,
        batchId: i.order.ItemBatchNumber,
      })),
    }).subscribe({
      next: async (res) => {
        await loading.dismiss();
        this.isSubmitting = false;
        await this.applyResults(res.Results, itemNames);
      },
      error: async (err) => {
        await loading.dismiss();
        this.isSubmitting = false;
        const d365Message = err?.error?.Message ?? err?.error?.message ?? err?.message;
        const toast = await this.toastCtrl.create({
          message: d365Message
            ? `Report failed: ${d365Message}`
            : 'Report failed. Check your connection and try again.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  /** Reported orders move to the confirmation screen; the rest stay in the list to retry. */
  private async applyResults(results: ReportAsFinishedLineResult[], itemNames: Map<string, string | undefined>) {
    const reported = results.filter(r => r.reported);
    const failed = results.filter(r => !r.reported);
    // Reported but the journal didn't post — the quantity is in D365, the journal isn't.
    const needsAttention = reported.filter(r => !r.posted);

    for (const r of reported) {
      this.cartMap.delete(r.productionOrderNumber);
    }
    if (reported.length > 0) {
      // Remaining quantities have changed in D365 — refetch before the next search.
      this.ordersLoaded = false;

      this.confirmedItems = reported.map(r => ({
        productionOrderNumber: r.productionOrderNumber,
        itemNumber: r.itemNumber,
        itemName: itemNames.get(r.productionOrderNumber),
        qty: r.reportedQty,
        journalNumber: r.journalNumber,
      }));
      this.confirmedCount = reported.length;
      this.confirmedTotalQty = reported.reduce((sum, r) => sum + r.reportedQty, 0);
      this.reportConfirmed = true;
    }

    if (failed.length > 0) {
      const detail = failed
        .map(f => `${f.productionOrderNumber}: ${f.errorMessage ?? 'not reported'}`)
        .join(' • ');
      const toast = await this.toastCtrl.create({
        message: reported.length > 0
          ? `${reported.length} of ${results.length} reported. ${detail}`
          : `Report failed. ${detail}`,
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'danger',
        position: 'bottom'
      });
      await toast.present();
    }

    if (needsAttention.length > 0) {
      const detail = needsAttention
        .map(r => `${r.productionOrderNumber}: ${r.errorMessage ?? r.message ?? 'no journal number returned — check the journal in D365'}`)
        .join(' • ');
      const toast = await this.toastCtrl.create({
        message: `Reported, but posting is unconfirmed. ${detail}`,
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'warning',
        position: 'bottom'
      });
      await toast.present();
    }
  }

  reportMore() {
    this.reportConfirmed = false;
    this.confirmedItems = [];
    this.ordersLoaded = false;
    this.clearSearch();
  }

  goToInventory() {
    this.router.navigate(['/inventory']);
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
          text: `${item.productionOrderNumber} — ${item.itemNumber} (${item.qty})`,
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
      component: FinishedGoodsLabelModalComponent,
      componentProps: { labelData: this.buildLabelData(item) },
      cssClass: 'label-preview-modal',
      breakpoints: [0, 0.9],
      initialBreakpoint: 0.9,
    });
    await modal.present();
  }

  private buildLabelData(item: ConfirmedItem): FinishedGoodsLabelData {
    return {
      productionOrderNumber: item.productionOrderNumber,
      journalNumber: item.journalNumber ?? '',
      itemNumber: item.itemNumber,
      productName: item.itemName,
      qty: item.qty,
      reportDate: new Date(),
    };
  }

  clearSearch() {
    this.searchTerm = '';
    this.matches = [];
    this.showDropdown = false;
  }
}
