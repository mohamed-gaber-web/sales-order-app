import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { VendorReturnService } from '../../../../core/services/vendor-return.service';
import { PurchaseOrderHeader, PurchaseOrderLine } from '../../../../models/purchase-order.model';

export const REASON_CODES: { label: string; value: string }[] = [
  { label: 'Defective',      value: 'Defective' },
  { label: 'Wrong Item',     value: 'WrongItem' },
  { label: 'Over-delivery',  value: 'Overdelivery' },
  { label: 'Damaged',        value: 'Damaged' },
  { label: 'Expired',        value: 'Expired' },
];

@Component({
  selector: 'app-vendor-returns-form',
  templateUrl: './vendor-returns-form.page.html',
  styleUrls: ['./vendor-returns-form.page.scss'],
  standalone: false,
})
export class VendorReturnsFormPage implements OnInit {
  poNumber = '';
  dataAreaId = 'usmf';
  order?: PurchaseOrderHeader;
  isLoading = false;
  isSubmitting = false;
  loadError = '';

  readonly reasonCodes = REASON_CODES;

  form!: FormGroup;

  get lines(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private vendorReturnService: VendorReturnService,
  ) {}

  ngOnInit() {
    this.poNumber = this.route.snapshot.paramMap.get('poNumber') ?? '';
    this.form = this.fb.group({ lines: this.fb.array([]) });
    this.loadOrder();
  }

  loadOrder() {
    this.isLoading = true;
    this.loadError = '';
    this.vendorReturnService.getOrderWithLines(this.poNumber, this.dataAreaId).subscribe({
      next: (order) => {
        this.order = order;
        this.isLoading = false;
        this.buildLineControls(order.PurchaseOrderLinesV2 ?? []);
      },
      error: async (err) => {
        this.isLoading = false;
        this.loadError = err?.error?.Message ?? err?.message ?? 'Could not load purchase order lines.';
        const t = await this.toastCtrl.create({ message: this.loadError, buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom' });
        await t.present();
      }
    });
  }

  private buildLineControls(poLines: PurchaseOrderLine[]) {
    const arr = this.form.get('lines') as FormArray;
    arr.clear();
    for (const line of poLines) {
      arr.push(this.fb.group({
        selected:   [false],
        lineNumber: [line.LineNumber],
        itemNumber: [line.ItemNumber],
        unitSymbol: [line.PurchaseUnitSymbol ?? ''],
        receivedQty: [line.PurchaseQuantity],
        returnQty:  [null, [Validators.min(0.001)]],
        reasonCode: ['', Validators.required],
      }));
    }
  }

  getLineGroup(index: number): FormGroup {
    return this.lines.at(index) as FormGroup;
  }

  get selectedCount(): number {
    return this.lines.controls.filter(c => c.get('selected')?.value && (c.get('returnQty')?.value ?? 0) > 0).length;
  }

  get hasValidSelection(): boolean {
    return this.lines.controls.some(c => {
      const g = c as FormGroup;
      return g.get('selected')?.value &&
             (g.get('returnQty')?.value ?? 0) > 0 &&
             g.get('reasonCode')?.value;
    });
  }

  async submitReturn() {
    if (!this.hasValidSelection || this.isSubmitting) return;

    const selectedLines = this.lines.controls
      .filter(c => {
        const g = c as FormGroup;
        return g.get('selected')?.value && (g.get('returnQty')?.value ?? 0) > 0 && g.get('reasonCode')?.value;
      })
      .map(c => {
        const g = c as FormGroup;
        return {
          lineNumber: g.get('lineNumber')?.value as number,
          itemNumber: g.get('itemNumber')?.value as string,
          returnQty:  g.get('returnQty')?.value as number,
          unitSymbol: g.get('unitSymbol')?.value as string | undefined,
          reasonCode: g.get('reasonCode')?.value as string,
        };
      });

    if (!selectedLines.length) return;

    const payload = {
      purchaseOrderNumber: this.poNumber,
      dataAreaId: this.dataAreaId,
      lines: selectedLines,
    };

    const loading = await this.loadingCtrl.create({ message: 'Submitting return...', spinner: 'crescent' });
    await loading.present();
    this.isSubmitting = true;

    this.vendorReturnService.postVendorReturn(payload).subscribe({
      next: async () => {
        await loading.dismiss();
        this.isSubmitting = false;
        const t = await this.toastCtrl.create({
          message: `Return for PO ${this.poNumber} submitted successfully.`,
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'success',
          position: 'bottom',
        });
        await t.present();
        this.router.navigate(['/inventory/vendor-returns']);
      },
      error: async (err) => {
        await loading.dismiss();
        this.isSubmitting = false;
        const msg = err?.error?.Message ?? err?.error?.message ?? err?.message ?? 'Return submission failed. Try again.';
        const t = await this.toastCtrl.create({ message: msg, buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom' });
        await t.present();
      }
    });
  }

  goBack() { this.router.navigate(['/inventory/vendor-returns']); }
}
