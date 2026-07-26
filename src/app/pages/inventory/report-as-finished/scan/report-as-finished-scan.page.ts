import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, LoadingController, ModalController, ToastController } from '@ionic/angular';
import { ReportAsFinishedService } from '../../../../core/services/report-as-finished.service';
import { ProductionOrder } from '../../../../models/inventory.model';
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
}

@Component({
  selector: 'app-report-as-finished-scan',
  templateUrl: './report-as-finished-scan.page.html',
  styleUrls: ['./report-as-finished-scan.page.scss'],
  standalone: false,
})
export class ReportAsFinishedScanPage implements OnInit {
  orders: ProductionOrder[] = [];
  isLoadingOrders = false;

  searchTerm = '';
  showDropdown = false;
  isSearching = false;
  matches: ProductionOrder[] = [];

  showManualEntry = false;
  manualOrderNumber = '';
  manualQty: number | null = null;

  isSubmitting = false;
  reportConfirmed = false;
  confirmedCount = 0;
  confirmedReportId = '';
  confirmedItems: ConfirmedItem[] = [];
  confirmedTotalQty = 0;

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

  /** Orders not already added to the cart — shown as a browsable list under the search box. */
  get availableOrders(): ProductionOrder[] {
    return this.orders.filter(o => !this.cartMap.has(o.ProductionOrderNumber));
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

  ngOnInit() {
    this.loadOrders();
  }

  private loadOrders(): Promise<void> {
    if (this.ordersLoaded) return Promise.resolve();
    this.isLoadingOrders = true;
    return new Promise((resolve, reject) => {
      this.rafService.getOpenProductionOrders().subscribe({
        next: (res) => {
          this.orders = res.value;
          this.ordersLoaded = true;
          this.isLoadingOrders = false;
          resolve();
        },
        error: (err) => {
          this.isLoadingOrders = false;
          reject(err instanceof Error ? err : new Error('Failed to load production orders'));
        },
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

  private buildCartItem(order: ProductionOrder, initialQty?: number): ReportCartItem {
    const remainingQty = this.getRemainingQty(order);
    const qty = initialQty && initialQty > 0 ? Math.min(initialQty, remainingQty) : remainingQty;
    return { order, qty, remainingQty };
  }

  async addItem(order: ProductionOrder, initialQty?: number) {
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

    this.cartMap.set(order.ProductionOrderNumber, this.buildCartItem(order, initialQty));
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

  toggleManualEntry() {
    this.showManualEntry = !this.showManualEntry;
    this.manualOrderNumber = '';
    this.manualQty = null;
  }

  async addManualItem() {
    const orderNum = this.manualOrderNumber.trim();
    if (!orderNum) return;

    try {
      await this.loadOrders();
    } catch {
      const toast = await this.toastCtrl.create({
        message: 'Could not load production orders. Check your connection.',
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    const match = this.orders.find(o => o.ProductionOrderNumber.toLowerCase() === orderNum.toLowerCase());
    if (!match) {
      const toast = await this.toastCtrl.create({
        message: `"${orderNum}" is not an open production order.`,
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    await this.addItem(match, this.manualQty ?? undefined);
    this.showManualEntry = false;
    this.manualOrderNumber = '';
    this.manualQty = null;
  }

  private generateReportId(): string {
    return `RAF-${Date.now()}`;
  }

  async submitReport() {
    if (!this.canSubmit || this.isSubmitting) return;
    this.isSubmitting = true;

    const items = this.cart;
    const reportId = this.generateReportId();

    const loading = await this.loadingCtrl.create({
      message: 'Recording report...',
      spinner: 'crescent'
    });
    await loading.present();

    this.rafService.reportAsFinished({
      dataAreaId: items[0]?.order.dataAreaId ?? 'usmf',
      reportId,
      lines: items.map(i => ({
        productionOrderNumber: i.order.ProductionOrderNumber,
        itemNumber: i.order.ItemNumber,
        reportedQty: i.qty,
      })),
    }).subscribe({
      next: async (res) => {
        await loading.dismiss();
        this.isSubmitting = false;
        if (res.Success) {
          this.confirmedCount = items.length;
          this.confirmedReportId = reportId;
          this.confirmedTotalQty = items.reduce((sum, i) => sum + i.qty, 0);
          this.confirmedItems = items.map((item) => ({
            productionOrderNumber: item.order.ProductionOrderNumber,
            itemNumber: item.order.ItemNumber,
            itemName: item.order.ItemName,
            qty: item.qty,
          }));
          this.reportConfirmed = true;
          this.cartMap.clear();
        } else {
          const serverMsg = (res.ErrorMessage || res.DebugMessage || '').trim();
          const toast = await this.toastCtrl.create({
            message: serverMsg ? `Report failed: ${serverMsg}` : 'Report failed. Try again.',
            buttons: [{ text: 'Dismiss', role: 'cancel' }],
            color: 'danger',
            position: 'bottom'
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

  reportMore() {
    this.reportConfirmed = false;
    this.confirmedItems = [];
    this.ordersLoaded = false;
    this.loadOrders();
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
      reportId: this.confirmedReportId,
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
