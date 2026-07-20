import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ValidationErrors, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { SalesShipmentService } from '../../../../core/services/sales-shipment.service';
import { SalesOrderLineService } from '../../../../core/services/sales-order-line.service';
import { SalesShipmentHeader } from '../../../../models/inventory.model';
import { PdfService, PackingSlipPdfData } from '../../../../core/services/pdf.service';

type ShipMode = 'all' | 'select';

interface ShipLineMeta {
  lineNumber: number;
  itemNumber: string;
  productName?: string;
  unit?: string;
  remaining: number;
}

interface ShippedLine {
  meta: ShipLineMeta;
  qty: number;
}

interface CreatedSlipSummary {
  packingSlipId: string;
  linesLabel: string;
}

/** Cross-field check: in "select" mode at least one line must be selected. */
function shipSelectionValidator(control: AbstractControl): ValidationErrors | null {
  if (control.get('shipMode')?.value !== 'select') return null;
  const lines = control.get('lines');
  const anySelected = lines instanceof FormArray &&
    lines.controls.some((row) => row.get('selected')?.value === true);
  return anySelected ? null : { noLineSelected: true };
}

@Component({
  selector: 'app-sales-shipment-ship',
  templateUrl: './sales-shipment-ship.page.html',
  styleUrls: ['./sales-shipment-ship.page.scss'],
  standalone: false,
})
export class SalesShipmentShipPage implements OnInit {
  soNumber = '';
  order: SalesShipmentHeader | null = null;
  form!: FormGroup;
  isSubmitting = false;

  slipConfirmed = false;
  slipPdfData: PackingSlipPdfData | null = null;
  isPdfBusy = false;

  shippableLines: ShipLineMeta[] = [];
  createdSlips: CreatedSlipSummary[] = [];
  lastSlipLinesLabel = 'All remaining';
  hasShippableRemaining = false;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private loadingCtrl = inject(LoadingController);
  private toastCtrl = inject(ToastController);
  private shipmentService = inject(SalesShipmentService);
  private lineService = inject(SalesOrderLineService);
  private pdfService = inject(PdfService);
  private destroyRef = inject(DestroyRef);

  ngOnInit() {
    this.soNumber = this.route.snapshot.paramMap.get('soNumber') ?? '';
    const state = history.state as { order?: SalesShipmentHeader };
    this.order = state?.order ?? null;

    this.form = this.fb.group({
      packingSlipId: ['', [Validators.required, Validators.minLength(1)]],
      dataAreaId:    ['usmf', Validators.required],
      shipMode:      ['all' as ShipMode, Validators.required],
      lines:         this.fb.array([]),
    }, { validators: shipSelectionValidator });

    this.loadOrderLines();
  }

  get shipMode(): ShipMode {
    return (this.form.get('shipMode')?.value as ShipMode) ?? 'all';
  }

  get lineRows(): FormArray {
    return this.form.get('lines') as FormArray;
  }

  get noLineSelected(): boolean {
    return this.form.hasError('noLineSelected');
  }

  private loadOrderLines() {
    if (!this.soNumber) return;
    this.lineService.getOrderLines(this.soNumber)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.shippableLines = (res.value ?? [])
            .map((l, i) => ({
              lineNumber: l.LineNumber ?? i + 1,
              itemNumber: l.ItemNumber,
              productName: l.ProductName,
              unit: l.SalesUnitSymbol,
              remaining: Number(l.RemainingSalesPhysicalQuantity ?? l.OrderedSalesQuantity ?? 0),
            }))
            .filter((l) => l.remaining > 0);
          this.rebuildLineRows();
        },
        error: () => {
          this.shippableLines = [];
          this.rebuildLineRows();
        },
      });
  }

  private rebuildLineRows() {
    const rows = this.lineRows;
    rows.clear();
    for (const line of this.shippableLines) {
      rows.push(this.fb.group({
        selected: [false],
        qty: [
          { value: line.remaining, disabled: true },
          [Validators.required, Validators.min(0.0001), Validators.max(line.remaining)],
        ],
      }));
    }
    this.hasShippableRemaining = this.shippableLines.length > 0;
  }

  onModeChange() {
    // Reset rows so a half-edited selection can't block "all remaining" posting
    this.lineRows.controls.forEach((row, i) => {
      row.get('selected')?.setValue(false, { emitEvent: false });
      const qty = row.get('qty');
      qty?.setValue(this.shippableLines[i]?.remaining ?? 0, { emitEvent: false });
      qty?.disable({ emitEvent: false });
    });
    this.form.updateValueAndValidity();
  }

  onLineToggle(index: number) {
    const row = this.lineRows.at(index);
    const qty = row.get('qty');
    if (row.get('selected')?.value === true) {
      qty?.enable();
    } else {
      qty?.setValue(this.shippableLines[index]?.remaining ?? 0);
      qty?.disable();
    }
  }

  async submitShipment() {
    if (this.form.invalid || this.isSubmitting) return;
    const { packingSlipId, dataAreaId } = this.form.value as { packingSlipId: string; dataAreaId: string };
    const mode = this.shipMode;

    let salesLineNum: number[] = [];
    let packingSlipQty: number[] = [];
    let shipped: ShippedLine[];

    if (mode === 'select') {
      shipped = this.shippableLines
        .map((meta, i) => ({ meta, row: this.lineRows.at(i) }))
        .filter(({ row }) => row.get('selected')?.value === true)
        .map(({ meta, row }) => ({ meta, qty: Number(row.get('qty')?.value ?? 0) }));
      salesLineNum = shipped.map((s) => s.meta.lineNumber);
      packingSlipQty = shipped.map((s) => s.qty);
    } else {
      shipped = this.shippableLines.map((meta) => ({ meta, qty: meta.remaining }));
    }

    const loading = await this.loadingCtrl.create({ message: 'Creating packing slip...', spinner: 'crescent' });
    await loading.present();
    this.isSubmitting = true;

    this.shipmentService.createPackingSlip({
      _request: {
        DataAreaId: dataAreaId.toUpperCase(),
        SalesOrderId: this.soNumber,
        PackingSlipId: packingSlipId.trim(),
        salesLineNum,
        packingSlipQty,
      }
    })
      .pipe(
        finalize(() => {
          loading.dismiss();
          this.isSubmitting = false;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.lastSlipLinesLabel = mode === 'select'
            ? `${shipped.length} of ${this.shippableLines.length} lines`
            : 'All remaining';
          this.slipPdfData = {
            salesOrderId: this.soNumber,
            packingSlipId: packingSlipId.trim(),
            dataAreaId: dataAreaId,
            customerAccount: this.order?.CustomerAccountNumber,
            customerName: this.order?.CustomerName,
            warehouse: this.order?.ShippingWarehouseId,
            slipDate: new Date(),
            lines: shipped.map(({ meta, qty }) => ({
              itemNumber: meta.itemNumber,
              productName: meta.productName,
              quantity: qty,
              unit: meta.unit,
            })),
          };
          this.createdSlips.push({ packingSlipId: packingSlipId.trim(), linesLabel: this.lastSlipLinesLabel });
          this.applyShipped(mode, shipped);
          this.slipConfirmed = true;
        },
        error: async (err) => {
          const msg = err?.error?.Message ?? err?.error?.message ?? err?.message ?? 'Shipment failed.';
          const t = await this.toastCtrl.create({ message: msg, buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom' });
          await t.present();
        }
      });
  }

  /** Subtract posted quantities locally so the next slip offers only what remains. */
  private applyShipped(mode: ShipMode, shipped: ShippedLine[]) {
    if (mode === 'all') {
      this.shippableLines = [];
    } else {
      const shippedByLine = new Map(shipped.map((s) => [s.meta.lineNumber, s.qty]));
      this.shippableLines = this.shippableLines
        .map((l) => ({ ...l, remaining: l.remaining - (shippedByLine.get(l.lineNumber) ?? 0) }))
        .filter((l) => l.remaining > 0);
    }
    this.rebuildLineRows();
  }

  createAnotherSlip() {
    this.form.get('packingSlipId')?.reset('');
    this.slipPdfData = null;
    this.slipConfirmed = false;
  }

  async downloadPdf() {
    if (!this.slipPdfData || this.isPdfBusy) return;
    this.isPdfBusy = true;
    try {
      await this.pdfService.downloadPackingSlip(this.slipPdfData);
    } catch {
      const t = await this.toastCtrl.create({ message: 'Could not generate PDF. Try again.', buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom' });
      await t.present();
    } finally {
      this.isPdfBusy = false;
    }
  }

  async sharePdf() {
    if (!this.slipPdfData || this.isPdfBusy) return;
    this.isPdfBusy = true;
    try {
      await this.pdfService.sharePackingSlip(this.slipPdfData);
    } catch {
      const t = await this.toastCtrl.create({ message: 'Could not share PDF. Try again.', buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom' });
      await t.present();
    } finally {
      this.isPdfBusy = false;
    }
  }

  goBack() { this.router.navigate(['/sales-order/list']); }
}
