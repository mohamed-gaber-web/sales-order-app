import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../../models/purchase-order.model';
import { PdfService, ReceiptPdfData } from '../../../core/services/pdf.service';

@Component({
  selector: 'app-purchase-order-receive',
  templateUrl: './purchase-order-receive.page.html',
  styleUrls: ['./purchase-order-receive.page.scss'],
  standalone: false
})
export class PurchaseOrderReceivePage implements OnInit {
  poNumber = '';
  lineNumber = 0;
  line: PurchaseOrderLine | null = null;
  po: PurchaseOrderHeader | null = null;

  form!: FormGroup;
  isSubmitting = false;

  receiptConfirmed = false;
  receiptPdfData: ReceiptPdfData | null = null;
  isPdfBusy = false;

  private safeNum(val: unknown, fallback = 0): number {
    const n = Number(val);
    return isNaN(n) || n < 0 ? fallback : n;
  }

  get totalQty(): number {
    if (!this.line) return 0;
    return this.safeNum(this.line.OrderedPurchaseQuantity ?? this.line.PurchaseQuantity);
  }

  get remainingQty(): number {
    if (!this.line) return 0;
    const rem = Number(this.line.RemainingPurchaseQuantity);
    return isNaN(rem) || rem < 0 ? this.totalQty : rem;
  }

  get receivedQty(): number {
    return Math.max(0, this.totalQty - this.remainingQty);
  }

  get receivedPct(): number {
    return this.totalQty > 0 ? Math.min(100, (this.receivedQty / this.totalQty) * 100) : 0;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private poService: PurchaseOrderService,
    private pdfService: PdfService
  ) {}

  ngOnInit() {
    this.poNumber = this.route.snapshot.paramMap.get('poNumber') ?? '';
    this.lineNumber = Number(this.route.snapshot.paramMap.get('lineNumber') ?? '0');

    // Retrieve line + po passed via router navigation state
    const state = history.state as { line?: PurchaseOrderLine; po?: PurchaseOrderHeader };
    this.line = state?.line ?? null;
    this.po = state?.po ?? null;

    this.form = this.fb.group({
      receiptQty: [
        this.remainingQty,
        [Validators.required, Validators.min(0.001), Validators.max(this.remainingQty)]
      ]
    });
  }

  setMaxQty() {
    this.form.patchValue({ receiptQty: this.remainingQty });
  }

  /** The create-receipt call requires a packing slip / receipt ID — generated silently since the user no longer enters one. */
  private generatePackingSlipId(): string {
    return `RCP-${this.poNumber}-${this.lineNumber}-${Date.now()}`;
  }

  async submitReceipt() {
    if (this.form.invalid || this.isSubmitting) return;
    this.isSubmitting = true;

    const { receiptQty } = this.form.value as { receiptQty: number };
    const packingSlipId = this.generatePackingSlipId();

    const loading = await this.loadingCtrl.create({
      message: 'Recording receipt...',
      spinner: 'crescent'
    });
    await loading.present();

    this.poService.createProductReceipt({
      _request: {
        DataAreaId: (this.po?.dataAreaId as string ?? 'usmf').toUpperCase(),
        purchaseOrderID: this.poNumber,
        packingSlipId,
        purchaseLineNum: [this.lineNumber],
        productReceiptQty: [receiptQty]
      }
    }).subscribe({
      next: async (res) => {
        await loading.dismiss();
        this.isSubmitting = false;
        if (res.Success) {
          this.receiptPdfData = {
            poNumber: this.poNumber,
            lineNumber: this.lineNumber,
            dataAreaId: (this.po?.dataAreaId as string ?? 'usmf'),
            packingSlipId,
            receiptQty: receiptQty,
            itemNumber: this.line?.ItemNumber ?? '',
            productName: this.line?.ProductName,
            unit: this.line?.PurchaseUnitSymbol,
            unitPrice: this.line?.PurchasePrice,
            currency: this.po?.CurrencyCode as string | undefined,
            warehouse: this.line?.ReceivingWarehouseId,
            vendor: (this.po?.OrderVendorAccountNumber ?? this.po?.VendorAccountNumber) as string | undefined,
            receiptDate: new Date()
          };
          this.receiptConfirmed = true;
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

  async downloadPdf() {
    if (!this.receiptPdfData || this.isPdfBusy) return;
    this.isPdfBusy = true;
    try {
      const uri = await this.pdfService.downloadReceipt(this.receiptPdfData);
      if (uri) {
        const toast = await this.toastCtrl.create({ message: 'PDF saved to your files.', duration: 3000, color: 'success', position: 'bottom' });
        await toast.present();
      }
    } catch {
      const toast = await this.toastCtrl.create({
        message: 'Could not save PDF. Try again.',
        duration: 3000,
        color: 'danger',
        position: 'bottom'
      });
      await toast.present();
    } finally {
      this.isPdfBusy = false;
    }
  }

  async sharePdf() {
    if (!this.receiptPdfData || this.isPdfBusy) return;
    this.isPdfBusy = true;
    try {
      await this.pdfService.shareReceipt(this.receiptPdfData);
    } catch {
      const toast = await this.toastCtrl.create({
        message: 'Could not share PDF. Try again.',
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
        color: 'danger',
        position: 'bottom'
      });
      await toast.present();
    } finally {
      this.isPdfBusy = false;
    }
  }

  goBack() {
    this.router.navigate(['/purchase-order/detail', this.poNumber]);
  }
}
