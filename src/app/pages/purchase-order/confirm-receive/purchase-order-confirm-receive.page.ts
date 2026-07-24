import { Component, OnInit, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { PurchaseOrderService } from '../../../core/services/purchase-order.service';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../../models/purchase-order.model';

interface ReceiptItem {
  line: PurchaseOrderLine;
  remainingQty: number;
  totalQty: number;
  alreadyReceivedQty: number;
}

interface ConfirmedItem {
  itemNumber: string;
  productName?: string;
  qty: number;
  unit?: string;
}

@Component({
  selector: 'app-purchase-order-confirm-receive',
  templateUrl: './purchase-order-confirm-receive.page.html',
  styleUrls: ['./purchase-order-confirm-receive.page.scss'],
  standalone: false,
})
export class PurchaseOrderConfirmReceivePage implements OnInit {
  poNumber = '';
  po: PurchaseOrderHeader | null = null;
  items: ReceiptItem[] = [];
  form!: FormGroup;

  purchaseOrderNumberInput = '';

  isSubmitting = false;
  receiptConfirmed = false;
  confirmedCount = 0;
  confirmedPackingSlipId = '';
  confirmedItems: ConfirmedItem[] = [];
  confirmedTotalQty = 0;

  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private poService = inject(PurchaseOrderService);

  get lineControls(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  get totalQty(): number {
    return this.lineControls.controls.reduce((sum, c) => sum + (Number(c.get('qty')?.value) || 0), 0);
  }

  private safeNum(val: unknown, fallback = 0): number {
    const n = Number(val);
    return isNaN(n) || n < 0 ? fallback : n;
  }

  private getRemainingQty(line: PurchaseOrderLine): number {
    const rem = Number(line.RemainingPurchaseQuantity);
    if (!isNaN(rem) && rem >= 0) return rem;
    return this.safeNum(line.OrderedPurchaseQuantity ?? line.PurchaseQuantity);
  }

  ngOnInit() {
    this.poNumber = this.route.snapshot.paramMap.get('poNumber') ?? '';
    const state = history.state as {
      po?: PurchaseOrderHeader;
      items?: PurchaseOrderLine[];
      qtyOverrides?: Record<number, number>;
    };
    this.po = state?.po ?? null;
    const lines = state?.items ?? [];
    const qtyOverrides = state?.qtyOverrides ?? {};

    if (!this.poNumber || lines.length === 0) {
      this.router.navigate(['/purchase-order/receive-by-barcode', this.poNumber].filter(Boolean));
      return;
    }

    this.purchaseOrderNumberInput = this.poNumber;

    this.items = [];
    const lineArray = this.fb.array<FormGroup>([]);
    for (const line of lines) {
      const { item, group } = this.buildReceiptItem(line, qtyOverrides[line.LineNumber]);
      this.items.push(item);
      lineArray.push(group);
    }
    this.form = this.fb.group({ lines: lineArray });
  }

  private buildReceiptItem(line: PurchaseOrderLine, initialQty?: number): { item: ReceiptItem; group: FormGroup } {
    const remainingQty = this.getRemainingQty(line);
    const totalQty = this.safeNum(line.OrderedPurchaseQuantity ?? line.PurchaseQuantity) || remainingQty;
    const item: ReceiptItem = { line, remainingQty, totalQty, alreadyReceivedQty: Math.max(0, totalQty - remainingQty) };
    const qty = initialQty && initialQty > 0 ? Math.min(initialQty, remainingQty) : remainingQty;
    const group = this.fb.group({
      qty: [qty, [Validators.required, Validators.min(0.001), Validators.max(remainingQty)]]
    });
    return { item, group };
  }

  qtyControl(index: number) {
    return this.lineControls.at(index).get('qty');
  }

  setMaxQty(index: number) {
    this.qtyControl(index)?.setValue(this.items[index].remainingQty);
  }

  adjustQty(index: number, delta: number) {
    const control = this.qtyControl(index);
    const item = this.items[index];
    if (!control || !item) return;
    const current = Number(control.value) || 0;
    const next = Math.min(item.remainingQty, Math.max(0.001, current + delta));
    control.setValue(Math.round(next * 1000) / 1000);
  }

  receivedPct(index: number): number {
    const item = this.items[index];
    if (!item || item.totalQty <= 0) return 0;
    return Math.min(100, (item.alreadyReceivedQty / item.totalQty) * 100);
  }

  thisReceiptPct(index: number): number {
    const item = this.items[index];
    if (!item || item.totalQty <= 0) return 0;
    const qty = Number(this.qtyControl(index)?.value) || 0;
    const room = Math.max(0, 100 - this.receivedPct(index));
    return Math.min(room, (qty / item.totalQty) * 100);
  }

  removeItem(index: number) {
    this.items.splice(index, 1);
    this.lineControls.removeAt(index);
    if (this.items.length === 0) {
      this.router.navigate(['/purchase-order/receive-by-barcode', this.poNumber]);
    }
  }

  private generatePackingSlipId(): string {
    return `RCP-${this.poNumber}-${Date.now()}`;
  }

  get canSubmit(): boolean {
    return !!this.form && !this.form.invalid && !!this.purchaseOrderNumberInput.trim();
  }

  async submitReceipt() {
    if (!this.canSubmit || this.isSubmitting || this.items.length === 0) return;
    this.isSubmitting = true;

    const packingSlipId = this.generatePackingSlipId();
    const purchaseLineNum = this.items.map(i => i.line.LineNumber);
    const productReceiptQty = this.lineControls.controls.map(c => Number(c.get('qty')?.value));

    const loading = await this.loadingCtrl.create({
      message: 'Recording receipt...',
      spinner: 'crescent'
    });
    await loading.present();

    this.poService.createProductReceipt({
      _request: {
        DataAreaId: ((this.po?.dataAreaId as string) ?? 'usmf').toUpperCase(),
        purchaseOrderID: this.purchaseOrderNumberInput.trim(),
        packingSlipId,
        purchaseLineNum,
        productReceiptQty
      }
    }).subscribe({
      next: async (res) => {
        await loading.dismiss();
        this.isSubmitting = false;
        if (res.Success) {
          this.confirmedCount = this.items.length;
          this.confirmedPackingSlipId = packingSlipId;
          this.confirmedTotalQty = productReceiptQty.reduce((sum, q) => sum + q, 0);
          this.confirmedItems = this.items.map((item, i) => ({
            itemNumber: item.line.ItemNumber,
            productName: item.line.ProductName,
            qty: productReceiptQty[i],
            unit: item.line.PurchaseUnitSymbol
          }));
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

  scanAnother() {
    this.router.navigate(['/purchase-order/receive-by-barcode', this.poNumber]);
  }

  goToOrder() {
    this.router.navigate(['/purchase-order/detail', this.poNumber]);
  }
}
