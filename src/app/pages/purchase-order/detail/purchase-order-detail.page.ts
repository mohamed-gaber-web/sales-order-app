import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { TimeoutError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, LoadingController, ModalController, ToastController } from '@ionic/angular';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../../models/purchase-order.model';
import { ScannerModalComponent } from '../../inventory/scanner/scanner-modal.component';

@Component({
  selector: 'app-purchase-order-detail',
  templateUrl: './purchase-order-detail.page.html',
  styleUrls: ['./purchase-order-detail.page.scss'],
  standalone: false
})
export class PurchaseOrderDetailPage implements OnInit {
  poNumber = '';
  po: PurchaseOrderHeader | null = null;
  isLoading = false;
  searchTerm = '';
  isSubmitting = false;
  selectedLines = new Map<number, PurchaseOrderLine>();
  private destroyRef = inject(DestroyRef);

  get filteredLines(): PurchaseOrderLine[] {
    const lines = this.po?.PurchaseOrderLinesV2 ?? [];
    if (!this.searchTerm.trim()) return lines;
    const t = this.searchTerm.toLowerCase();
    return lines.filter(l =>
      l.ItemNumber.toLowerCase().includes(t) ||
      (l.ProductName ?? '').toLowerCase().includes(t) ||
      (l.ReceivingWarehouseId ?? '').toLowerCase().includes(t)
    );
  }

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private loadingCtrl = inject(LoadingController);
  private modalCtrl = inject(ModalController);
  private poService = inject(PurchaseOrderService);

  ngOnInit() {
    this.poNumber = this.route.snapshot.paramMap.get('poNumber') ?? '';
  }

  /**
   * Ionic keeps this page's component instance alive in the nav stack, so ngOnInit
   * only fires once. Without this, coming back here after receiving (via /receive or
   * the barcode flow) shows the stale pre-receipt quantities and progress bar.
   */
  ionViewWillEnter() {
    if (this.poNumber) {
      this.loadDetail();
    }
  }

  loadDetail() {
    this.isLoading = true;
    this.po = null;
    this.selectedLines.clear();
    this.poService.getOrderWithLines(this.poNumber).subscribe({
      next: (res) => {
        this.po = res;
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: 'Couldn\'t load this order. Tap retry.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  async scanToReceive() {
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
      await this.handleScannedItem(value);
    }
  }

  private async handleScannedItem(value: string) {
    const v = value.toLowerCase();
    const lines = this.po?.PurchaseOrderLinesV2 ?? [];
    const matches = lines.filter(l => l.ItemNumber.toLowerCase() === v);

    if (matches.length === 0) {
      this.searchTerm = value;
      const toast = await this.toastCtrl.create({
        message: `No line for "${value}" on this order.`,
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'danger',
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    const open = matches.find(l => !this.isFullyReceived(l));
    if (!open) {
      const toast = await this.toastCtrl.create({
        message: `${matches[0].ItemNumber} is already fully received.`,
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'warning',
        position: 'bottom',
      });
      await toast.present();
      return;
    }

    this.receiveLine(open);
  }

  receiveLine(line: PurchaseOrderLine) {
    this.router.navigate(
      ['/purchase-order/receive', this.poNumber, line.LineNumber],
      { state: { line, po: this.po } }
    );
  }

  toggleLine(line: PurchaseOrderLine) {
    if (this.selectedLines.has(line.LineNumber)) {
      this.selectedLines.delete(line.LineNumber);
    } else {
      this.selectedLines.set(line.LineNumber, line);
    }
  }

  clearSelection() {
    this.selectedLines.clear();
  }

  async receiveSelected() {
    if (this.selectedLines.size === 0 || this.isSubmitting) return;
    const selected = Array.from(this.selectedLines.values());

    const alert = await this.alertCtrl.create({
      header: 'Receive Items',
      subHeader: `${selected.length} lines — full remaining quantity`,
      inputs: [
        {
          name: 'packingSlipId',
          type: 'text',
          placeholder: 'Packing Slip ID',
        },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Receive',
          handler: (data) => {
            const slipId = String(data.packingSlipId ?? '').trim();
            if (!slipId) return false;
            this.submitMultiReceipt(selected, slipId);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async submitMultiReceipt(selected: PurchaseOrderLine[], packingSlipId: string) {
    if (this.isSubmitting) return;
    this.isSubmitting = true;

    const loading = await this.loadingCtrl.create({
      message: `Recording receipt for ${selected.length} lines...`,
      spinner: 'crescent',
    });
    await loading.present();

    this.poService.createProductReceipt({
      _request: {
        DataAreaId: ((this.po?.dataAreaId as string) ?? 'usmf').toUpperCase(),
        purchaseOrderID: this.poNumber,
        productReceiptId: packingSlipId,
        purchaseLineNum: selected.map((l) => l.LineNumber),
        productReceiptQty: selected.map((l) => this.getRemainingQty(l)),
      },
    })
      .pipe(
        finalize(() => {
          loading.dismiss();
          this.isSubmitting = false;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: async (res) => {
          if (res.Success) {
            const toast = await this.toastCtrl.create({
              message: `Receipt recorded for ${selected.length} lines.`,
              buttons: [{ text: 'Dismiss', role: 'cancel' }],
              color: 'success',
              position: 'bottom',
            });
            await toast.present();
            this.loadDetail();
          } else {
            const serverMsg = (res.ErrorMessage || res.DebugMessage || '').trim();
            const toast = await this.toastCtrl.create({
              message: serverMsg ? `Receipt failed: ${serverMsg}` : 'Receipt failed. Try again.',
              buttons: [{ text: 'Dismiss', role: 'cancel' }],
              color: 'danger',
              position: 'bottom',
            });
            await toast.present();
          }
        },
        error: async (err: unknown) => {
          if (err instanceof TimeoutError) {
            this.loadDetail();
            const toast = await this.toastCtrl.create({
              message: 'Taking longer than expected. Refreshed the order — check remaining quantities before submitting again.',
              buttons: [{ text: 'Dismiss', role: 'cancel' }],
              color: 'warning',
              position: 'bottom',
            });
            await toast.present();
            return;
          }

          const e = err as { error?: { Message?: string; message?: string }; message?: string };
          const msg = e?.error?.Message ?? e?.error?.message ?? e?.message;
          const toast = await this.toastCtrl.create({
            message: msg ? `Receipt failed: ${msg}` : 'Receipt failed. Check your connection and try again.',
            buttons: [{ text: 'Dismiss', role: 'cancel' }],
            color: 'danger',
            position: 'bottom',
          });
          await toast.present();
        },
      });
  }

  goBack() {
    this.router.navigate(['/purchase-order/list']);
  }

  private safeNum(val: unknown, fallback = 0): number {
    const n = Number(val);
    return isNaN(n) || n < 0 ? fallback : n;
  }

  getTotalQty(line: PurchaseOrderLine): number {
    return this.safeNum(line.OrderedPurchaseQuantity ?? line.PurchaseQuantity);
  }

  getRemainingQty(line: PurchaseOrderLine): number {
    const rem = Number(line.RemainingPurchaseQuantity);
    return isNaN(rem) || rem < 0 ? this.getTotalQty(line) : rem;
  }

  isFullyReceived(line: PurchaseOrderLine): boolean {
    return this.getTotalQty(line) > 0 && this.getRemainingQty(line) <= 0;
  }

  getLineStatusColor(line: PurchaseOrderLine): string {
    const total = this.getTotalQty(line);
    const remaining = this.getRemainingQty(line);
    if (total > 0 && remaining <= 0) return 'success';
    if (remaining < total) return 'warning';
    return 'primary';
  }

  getLineStatusLabel(line: PurchaseOrderLine): string {
    const total = this.getTotalQty(line);
    const remaining = this.getRemainingQty(line);
    if (total > 0 && remaining <= 0) return 'Received';
    if (remaining < total) return 'Partial';
    return 'Open';
  }

  getReceivedQty(line: PurchaseOrderLine): number {
    return Math.max(0, this.getTotalQty(line) - this.getRemainingQty(line));
  }

  getReceivedPct(line: PurchaseOrderLine): number {
    const total = this.getTotalQty(line);
    if (total <= 0) return 0;
    return Math.min(100, Math.round((this.getReceivedQty(line) / total) * 100));
  }
}
