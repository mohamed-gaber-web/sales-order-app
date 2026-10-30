import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { TimeoutError } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, LoadingController, ModalController, ToastController } from '@ionic/angular';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../../models/purchase-order.model';
import { ScannerModalComponent } from '../../inventory/scanner/scanner-modal.component';
import { TenantConfigStore } from '../../../core/tenant/tenant-config.store';
import { PortalSessionStore } from '../../../core/auth/portal-session.store';
import {
  PdfService,
  PurchaseConfirmationPdfData,
  PurchaseReceiptLine,
  PurchaseReceiptPdfData,
} from '../../../core/services/pdf.service';

/** A document just produced on this screen, kept so it can be printed. */
type Printable =
  | { kind: 'receipt'; data: PurchaseReceiptPdfData }
  | { kind: 'confirmation'; data: PurchaseConfirmationPdfData };

@Component({
  selector: 'app-purchase-order-detail',
  templateUrl: './purchase-order-detail.page.html',
  styleUrls: ['./purchase-order-detail.page.scss'],
  standalone: false
})
export class PurchaseOrderDetailPage implements OnInit {
  private readonly tenantConfig = inject(TenantConfigStore);
  private readonly session = inject(PortalSessionStore);

  poNumber = '';
  po: PurchaseOrderHeader | null = null;
  isLoading = false;
  searchTerm = '';
  isSubmitting = false;
  isConfirming = false;
  isPrinting = false;
  printable: Printable | null = null;
  selectedLines = new Map<number, PurchaseOrderLine>();
  private destroyRef = inject(DestroyRef);

  /**
   * D365 cannot receive against an order until it is confirmed, so an order created
   * in the app shows Confirm first and Receive only once that succeeds.
   */
  get needsConfirmation(): boolean {
    const status = this.po?.DocumentApprovalStatus;
    return !!this.po && status !== 'Confirmed' && status !== 'Finalized';
  }

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
  private pdfService = inject(PdfService);

  ngOnInit() {
    this.poNumber = this.route.snapshot.paramMap.get('poNumber') ?? '';
  }

  /**
   * Ionic keeps this page's component instance alive in the nav stack, so ngOnInit
   * only fires once. Without this, coming back here after receiving (via /receive or
   * the barcode flow) shows the stale pre-receipt quantities and progress bar.
   */
  ionViewWillEnter() {
    this.printable = null;
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
    if (this.needsConfirmation) return;
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
        DataAreaId: ((this.po?.dataAreaId as string) ?? this.tenantConfig.currentDataAreaId()).toUpperCase(),
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
            // Captured before the reload, which replaces the lines with their new remaining quantities.
            this.printable = {
              kind: 'receipt',
              data: {
                poNumber: this.poNumber,
                packingSlipId,
                dataAreaId: (this.po?.dataAreaId as string) ?? this.tenantConfig.currentDataAreaId(),
                vendor: this.vendor,
                receiptDate: new Date(),
                lines: this.printLines(selected, (l) => this.getRemainingQty(l)),
              },
            };
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

  async printDocument() {
    const doc = this.printable;
    if (!doc || this.isPrinting) return;
    this.isPrinting = true;
    try {
      if (doc.kind === 'receipt') {
        await this.pdfService.printPurchaseReceipt(doc.data);
      } else {
        await this.pdfService.printPurchaseConfirmation(doc.data);
      }
    } catch {
      await this.showToast('Could not print. Try again.', 'danger');
    } finally {
      this.isPrinting = false;
    }
  }

  dismissPrintable() {
    this.printable = null;
  }

  /** The order's lines as they stand, for a printed document. */
  private printLines(lines: PurchaseOrderLine[], qty: (l: PurchaseOrderLine) => number): PurchaseReceiptLine[] {
    return lines.map((l) => ({
      lineNumber: l.LineNumber,
      itemNumber: l.ItemNumber,
      productName: l.ProductName,
      quantity: qty(l),
      unit: l.PurchaseUnitSymbol,
    }));
  }

  private get vendor(): string | undefined {
    return (this.po?.OrderVendorAccountNumber ?? this.po?.VendorAccountNumber) as string | undefined;
  }

  async confirmOrder() {
    if (!this.po || this.isConfirming) return;
    this.isConfirming = true;

    const loading = await this.loadingCtrl.create({
      message: 'Confirming order...',
      spinner: 'crescent',
    });
    await loading.present();

    this.poService.confirmOrder({
      _request: {
        UserId: this.session.user()?.email ?? '',
        DataAreaId: ((this.po.dataAreaId as string) ?? this.tenantConfig.currentDataAreaId()).toUpperCase(),
        PurchId: this.poNumber,
        ConfirmDate: this.today(),
      },
    })
      .pipe(
        finalize(() => {
          loading.dismiss();
          this.isConfirming = false;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: async (res) => {
          if (res?.Success === false) {
            const serverMsg = (res.ErrorMessage || res.DebugMessage || '').trim();
            await this.showToast(serverMsg ? `Confirm failed: ${serverMsg}` : 'Confirm failed. Try again.', 'danger');
            return;
          }
          // Captured before the reload replaces the order.
          this.printable = {
            kind: 'confirmation',
            data: {
              poNumber: this.poNumber,
              dataAreaId: (this.po?.dataAreaId as string) ?? this.tenantConfig.currentDataAreaId(),
              vendor: this.vendor,
              confirmDate: new Date(),
              lines: this.printLines(this.po?.PurchaseOrderLinesV2 ?? [], (l) => this.getTotalQty(l)),
            },
          };
          this.loadDetail();
        },
        error: async (err: unknown) => {
          if (err instanceof TimeoutError) {
            this.loadDetail();
            await this.showToast('Taking longer than expected. Refreshed the order — check its status before confirming again.', 'warning');
            return;
          }
          const e = err as { error?: { Message?: string; message?: string }; message?: string };
          const msg = e?.error?.Message ?? e?.error?.message ?? e?.message;
          await this.showToast(msg ? `Confirm failed: ${msg}` : 'Confirm failed. Check your connection and try again.', 'danger');
        },
      });
  }

  /** Local calendar date as yyyy-MM-dd — toISOString() would shift it to UTC. */
  private today(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private async showToast(message: string, color: 'success' | 'warning' | 'danger') {
    const toast = await this.toastCtrl.create({
      message,
      buttons: [{ text: 'Dismiss', role: 'cancel' }],
      color,
      position: 'bottom',
    });
    await toast.present();
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
