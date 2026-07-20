import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ModalController, ToastController } from '@ionic/angular';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../../models/purchase-order.model';
import { PdfService, ReceiptPdfData } from '../../../core/services/pdf.service';
import { ScannerModalComponent } from '../../inventory/scanner/scanner-modal.component';

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

  private modalCtrl = inject(ModalController);

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
      ],
      packingSlipId: ['', [Validators.required, Validators.minLength(1)]]
    });
  }

  setMaxQty() {
    this.form.patchValue({ receiptQty: this.remainingQty });
  }

  async scanPackingSlip() {
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
      this.form.patchValue({ packingSlipId: value });
      this.form.get('packingSlipId')?.markAsTouched();
    }
  }

  async submitReceipt() {
    if (this.form.invalid || this.isSubmitting) return;

    const { receiptQty, packingSlipId } = this.form.value as { receiptQty: number; packingSlipId: string };

    const loading = await this.loadingCtrl.create({
      message: 'Recording receipt...',
      spinner: 'crescent'
    });
    await loading.present();
    this.isSubmitting = true;

    this.poService.createProductReceipt({
      _request: {
        DataAreaId: (this.po?.dataAreaId as string ?? 'usmf').toUpperCase(),
        purchaseOrderID: this.poNumber,
        packingSlipId: packingSlipId.trim(),
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
            packingSlipId: packingSlipId.trim(),
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
          const toast = await this.toastCtrl.create({
            message: res.Message ? `Receipt failed: ${res.Message}` : 'Receipt failed. Try again.',
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
      await this.pdfService.downloadReceipt(this.receiptPdfData);
    } catch {
      const toast = await this.toastCtrl.create({
        message: 'Could not generate PDF. Try again.',
        buttons: [{ text: 'Dismiss', role: 'cancel' }],
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
