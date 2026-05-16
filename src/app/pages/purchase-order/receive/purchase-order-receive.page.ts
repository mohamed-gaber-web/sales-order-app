import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../../models/purchase-order.model';

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

  get remainingQty(): number {
    if (!this.line) return 0;
    return this.line.RemainingPurchaseQuantity ?? this.line.PurchaseQuantity;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private poService: PurchaseOrderService
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
      ],
      packingSlipId: ['', [Validators.required, Validators.minLength(1)]]
    });
  }

  setMaxQty() {
    this.form.patchValue({ receiptQty: this.remainingQty });
  }

  async submitReceipt() {
    if (this.form.invalid || this.isSubmitting) return;

    const { receiptQty, packingSlipId } = this.form.value as { receiptQty: number; packingSlipId: string };

    const loading = await this.loadingCtrl.create({
      message: 'Posting receipt...',
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
      next: async () => {
        await loading.dismiss();
        this.isSubmitting = false;
        const toast = await this.toastCtrl.create({
          message: `Receipt posted successfully for line ${this.lineNumber}.`,
          duration: 3000,
          color: 'success',
          position: 'bottom'
        });
        await toast.present();
        this.router.navigate(['/purchase-order/detail', this.poNumber]);
      },
      error: async (err) => {
        await loading.dismiss();
        this.isSubmitting = false;
        const d365Message = err?.error?.Message ?? err?.error?.message ?? err?.message;
        const toast = await this.toastCtrl.create({
          message: d365Message
            ? `Receipt failed: ${d365Message}`
            : 'Failed to post receipt. Please try again.',
          duration: 5000,
          color: 'danger',
          position: 'bottom'
        });
        await toast.present();
      }
    });
  }

  goBack() {
    this.router.navigate(['/purchase-order/detail', this.poNumber]);
  }
}
