import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionSheetController, LoadingController, ModalController, ToastController } from '@ionic/angular';
import { TimeoutError } from 'rxjs';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../../models/purchase-order.model';
import { ReceiptLabelData } from '../../../core/services/pdf.service';
import { ScannerModalComponent } from '../../inventory/scanner/scanner-modal.component';
import { LabelPreviewModalComponent } from '../label-preview/label-preview-modal.component';
import { TenantConfigStore } from '../../../core/tenant/tenant-config.store';

interface ReceiptCartItem {
  line: PurchaseOrderLine;
  qty: number;
  remainingQty: number;
  totalQty: number;
  alreadyReceivedQty: number;
}

interface ConfirmedItem {
  itemNumber: string;
  productName?: string;
  lineNumber: number;
  qty: number;
  unit?: string;
}

@Component({
  selector: 'app-purchase-order-scan-receive',
  templateUrl: './purchase-order-scan-receive.page.html',
  styleUrls: ['./purchase-order-scan-receive.page.scss'],
  standalone: false,
})
export class PurchaseOrderScanReceivePage implements OnInit {
  private readonly tenantConfig = inject(TenantConfigStore);

  poNumber = '';
  po: PurchaseOrderHeader | null = null;

  searchTerm = '';
  showDropdown = false;
  isSearching = false;
  matches: PurchaseOrderLine[] = [];

  showManualEntry = false;
  manualItemNumber = '';
  manualQty: number | null = null;

  isSubmitting = false;
  receiptConfirmed = false;
  confirmedCount = 0;
  confirmedPackingSlipId = '';
  confirmedItems: ConfirmedItem[] = [];
  confirmedTotalQty = 0;

  private cartMap = new Map<number, ReceiptCartItem>();
  private openLines: PurchaseOrderLine[] = [];
  private linesLoaded = false;
  private searchSeq = 0;

  get cart(): ReceiptCartItem[] {
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
  private actionSheetCtrl = inject(ActionSheetController);
  private poService = inject(PurchaseOrderService);

  private safeNum(val: unknown, fallback = 0): number {
    const n = Number(val);
    return isNaN(n) || n < 0 ? fallback : n;
  }

  getRemainingQty(line: PurchaseOrderLine): number {
    const rem = Number(line.RemainingPurchaseQuantity);
    if (!isNaN(rem) && rem >= 0) return rem;
    return this.safeNum(line.OrderedPurchaseQuantity ?? line.PurchaseQuantity);
  }

  isQtyValid(item: ReceiptCartItem): boolean {
    return item.qty > 0 && item.qty <= item.remainingQty;
  }

  ngOnInit() {
    this.poNumber = this.route.snapshot.paramMap.get('poNumber') ?? '';
    if (!this.poNumber) {
      this.router.navigate(['/purchase-order/receive-by-barcode']);
    }
  }

  /**
   * Ionic keeps this page alive in the nav stack, so ngOnInit only fires once.
   * "Receive More Items" resets state in place on this same page — without invalidating
   * the cache, the next search would keep using pre-receipt remaining quantities.
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
        message: `Could not load PO ${this.poNumber}. Check your connection.`,
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
      this.poService.getOrderWithLines(this.poNumber).subscribe({
        next: (po) => {
          this.po = po;
          this.openLines = (po.PurchaseOrderLinesV2 ?? []).filter(l => this.getRemainingQty(l) > 0);
          this.linesLoaded = true;
          resolve();
        },
        error: (err) => reject(err instanceof Error ? err : new Error('Failed to load purchase order')),
      });
    });
  }

  private buildCartItem(line: PurchaseOrderLine, initialQty?: number): ReceiptCartItem {
    const remainingQty = this.getRemainingQty(line);
    const totalQty = this.safeNum(line.OrderedPurchaseQuantity ?? line.PurchaseQuantity) || remainingQty;
    const alreadyReceivedQty = Math.max(0, totalQty - remainingQty);
    const qty = initialQty && initialQty > 0 ? Math.min(initialQty, remainingQty) : remainingQty;
    return { line, qty, remainingQty, totalQty, alreadyReceivedQty };
  }

  async addItem(line: PurchaseOrderLine, initialQty?: number) {
    this.showDropdown = false;
    this.clearSearch();

    if (this.cartMap.has(line.LineNumber)) {
      const toast = await this.toastCtrl.create({
        message: `${line.ItemNumber} is already in your list below.`,
        duration: 2000,
        color: 'warning',
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    this.cartMap.set(line.LineNumber, this.buildCartItem(line, initialQty));
  }

  removeFromCart(item: ReceiptCartItem) {
    this.cartMap.delete(item.line.LineNumber);
  }

  clearCart() {
    this.cartMap.clear();
  }

  adjustQty(item: ReceiptCartItem, delta: number) {
    // Clamp to 0 (not 0.001) so a decrement lands on a clean value instead of a
    // near-invisible sliver; landing on 0 trips the "must be greater than 0" validation.
    const next = Math.min(item.remainingQty, Math.max(0, item.qty + delta));
    item.qty = Math.round(next * 1000) / 1000;
  }

  setMaxQty(item: ReceiptCartItem) {
    item.qty = item.remainingQty;
  }

  clampQty(item: ReceiptCartItem) {
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
          message: `Could not load PO ${this.poNumber}. Check your connection.`,
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
        message: `"${itemNum}" is not an open line on PO ${this.poNumber}.`,
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

  private generatePackingSlipId(): string {
    return `RCP-${this.poNumber}-${Date.now()}`;
  }

  async submitReceipt() {
    if (!this.canSubmit || this.isSubmitting || !this.po) return;
    this.isSubmitting = true;

    const items = this.cart;
    const packingSlipId = this.generatePackingSlipId();
    const purchaseLineNum = items.map(i => i.line.LineNumber);
    const productReceiptQty = items.map(i => i.qty);

    const loading = await this.loadingCtrl.create({
      message: 'Recording receipt...',
      spinner: 'crescent'
    });
    await loading.present();

    this.poService.createProductReceipt({
      _request: {
        DataAreaId: ((this.po?.dataAreaId as string) ?? this.tenantConfig.currentDataAreaId()).toUpperCase(),
        purchaseOrderID: this.poNumber,
        productReceiptId: packingSlipId,
        purchaseLineNum,
        productReceiptQty,
      }
    }).subscribe({
      next: async (res) => {
        await loading.dismiss();
        this.isSubmitting = false;
        if (res.Success) {
          this.confirmedCount = items.length;
          this.confirmedPackingSlipId = packingSlipId;
          this.confirmedTotalQty = productReceiptQty.reduce((sum, q) => sum + q, 0);
          this.confirmedItems = items.map((item, i) => ({
            itemNumber: item.line.ItemNumber,
            productName: item.line.ProductName,
            lineNumber: item.line.LineNumber,
            qty: productReceiptQty[i],
            unit: item.line.PurchaseUnitSymbol
          }));
          this.receiptConfirmed = true;
          this.cartMap.clear();
        } else {
          const serverMsg = (res.ErrorMessage || res.DebugMessage || '').trim();
          const toast = await this.toastCtrl.create({
            message: serverMsg ? `Receipt failed: ${serverMsg}` : 'Receipt failed. Try again.',
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

        if (err instanceof TimeoutError) {
          const toast = await this.toastCtrl.create({
            message: 'Taking longer than expected. This receipt may have already gone through — check the order before submitting again.',
            buttons: [{ text: 'Check order', handler: () => this.goToOrder() }],
            color: 'warning',
            position: 'bottom'
          });
          await toast.present();
          return;
        }

        const d365Message = err?.error?.Message ?? err?.error?.message ?? err?.message;
        const toast = await this.toastCtrl.create({
          message: d365Message
            ? `Receipt failed: ${d365Message}`
            : 'Receipt failed. Check your connection and try again.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  receiveMore() {
    this.receiptConfirmed = false;
    this.confirmedItems = [];
    this.linesLoaded = false;
  }

  goToOrder() {
    this.router.navigate(['/purchase-order/detail', this.poNumber]);
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
          text: `${item.itemNumber} — ${item.qty}${item.unit ? ' ' + item.unit : ''}`,
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
      component: LabelPreviewModalComponent,
      componentProps: { labelData: this.buildLabelData(item) },
      cssClass: 'label-preview-modal',
      breakpoints: [0, 0.9],
      initialBreakpoint: 0.9,
    });
    await modal.present();
  }

  private buildLabelData(item: ConfirmedItem): ReceiptLabelData {
    return {
      poNumber: this.poNumber,
      lineNumber: item.lineNumber,
      packingSlipId: this.confirmedPackingSlipId,
      itemNumber: item.itemNumber,
      productName: item.productName,
      qty: item.qty,
      unit: item.unit,
      receiptDate: new Date(),
    };
  }

  clearSearch() {
    this.searchTerm = '';
    this.matches = [];
    this.showDropdown = false;
  }

  changeOrder() {
    this.router.navigate(['/purchase-order/receive-by-barcode']);
  }
}
