import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { SalesShipmentService } from '../../../../core/services/sales-shipment.service';
import { SalesOrderLineService, SalesOrderLineResponse } from '../../../../core/services/sales-order-line.service';
import { SalesShipmentHeader } from '../../../../models/inventory.model';
import { PdfService, PackingSlipPdfData } from '../../../../core/services/pdf.service';

interface SelectedShipLine {
  line: SalesOrderLineResponse;
  qty: number;
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
  confirmedLineCount = 0;

  linesLoading = false;
  orderLinesData: SalesOrderLineResponse[] = [];
  private _selectedLines = new Map<number, SelectedShipLine>();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private shipmentService: SalesShipmentService,
    private lineService: SalesOrderLineService,
    private pdfService: PdfService,
  ) {}

  ngOnInit() {
    this.soNumber = this.route.snapshot.paramMap.get('soNumber') ?? '';
    const state = history.state as { order?: SalesShipmentHeader };
    this.order = state?.order ?? null;

    this.form = this.fb.group({
      packingSlipId: ['', [Validators.required, Validators.minLength(1)]],
      dataAreaId:    ['usmf', Validators.required],
    });

    this.loadOrderLines();
  }

  private loadOrderLines() {
    if (!this.soNumber) return;
    this.linesLoading = true;
    this.lineService.getOrderLines(this.soNumber).subscribe({
      next: (res) => {
        this.orderLinesData = res.value ?? [];
        this._selectedLines.clear();
        this.orderLinesData.forEach((l, i) => {
          this._selectedLines.set(this.lineKey(l, i), {
            line: l,
            qty: Number(l.OrderedSalesQuantity ?? 1),
          });
        });
        this.linesLoading = false;
      },
      error: () => {
        this.orderLinesData = [];
        this.linesLoading = false;
      },
    });
  }

  // ── Selection state ──────────────────────────────────────────

  get selectedCount(): number { return this._selectedLines.size; }
  get totalLines(): number { return this.orderLinesData.length; }
  get allSelected(): boolean { return this.totalLines > 0 && this._selectedLines.size === this.totalLines; }
  get noneSelected(): boolean { return this._selectedLines.size === 0; }
  get selectedLinesList(): SelectedShipLine[] { return [...this._selectedLines.values()]; }

  lineKey(line: SalesOrderLineResponse, index: number): number {
    return line.LineNumber ?? index;
  }

  isSelected(line: SalesOrderLineResponse, index: number): boolean {
    return this._selectedLines.has(this.lineKey(line, index));
  }

  toggleLine(line: SalesOrderLineResponse, index: number) {
    const key = this.lineKey(line, index);
    if (this._selectedLines.has(key)) {
      this._selectedLines.delete(key);
    } else {
      this._selectedLines.set(key, { line, qty: Number(line.OrderedSalesQuantity ?? 1) });
    }
  }

  selectAll() {
    this.orderLinesData.forEach((l, i) => {
      const key = this.lineKey(l, i);
      if (!this._selectedLines.has(key)) {
        this._selectedLines.set(key, { line: l, qty: Number(l.OrderedSalesQuantity ?? 1) });
      }
    });
  }

  deselectAll() { this._selectedLines.clear(); }

  // ── Qty stepper ───────────────────────────────────────────────

  getQty(line: SalesOrderLineResponse, index: number): number {
    return this._selectedLines.get(this.lineKey(line, index))?.qty ?? 0;
  }

  decrementQty(line: SalesOrderLineResponse, index: number, event: Event) {
    event.stopPropagation();
    const entry = this._selectedLines.get(this.lineKey(line, index));
    if (!entry || entry.qty <= 1) return;
    entry.qty--;
  }

  incrementQty(line: SalesOrderLineResponse, index: number, event: Event) {
    event.stopPropagation();
    const entry = this._selectedLines.get(this.lineKey(line, index));
    if (!entry) return;
    if (entry.qty >= Number(line.OrderedSalesQuantity ?? 1)) return;
    entry.qty++;
  }

  // ── Helpers ───────────────────────────────────────────────────

  getDimensions(line: SalesOrderLineResponse): string {
    return [line.ProductConfigurationId, line.ProductStyleId, line.ProductSizeId, line.ProductColorId]
      .filter(Boolean).join(' · ');
  }

  // ── Submit ────────────────────────────────────────────────────

  async submitShipment() {
    if (this.form.invalid || this.isSubmitting || this._selectedLines.size === 0) return;
    const { packingSlipId, dataAreaId } = this.form.value as { packingSlipId: string; dataAreaId: string };

    const loading = await this.loadingCtrl.create({ message: 'Creating packing slip...', spinner: 'crescent' });
    await loading.present();
    this.isSubmitting = true;

    const selectedList = this.selectedLinesList;
    const hasValidLineNums = selectedList.every(s => s.line.LineNumber != null);
    const salesLineNum = hasValidLineNums ? selectedList.map(s => s.line.LineNumber as number) : [];
    const packingSlipQty = hasValidLineNums ? selectedList.map(s => s.qty) : [];

    this.shipmentService.createPackingSlip({
      _request: {
        DataAreaId: dataAreaId.toUpperCase(),
        SalesOrderId: this.soNumber,
        PackingSlipId: packingSlipId.trim(),
        salesLineNum,
        packingSlipQty,
      }
    }).subscribe({
      next: async () => {
        await loading.dismiss();
        this.isSubmitting = false;
        this.confirmedLineCount = selectedList.length;
        this.slipPdfData = {
          salesOrderId: this.soNumber,
          packingSlipId: packingSlipId.trim(),
          dataAreaId,
          customerAccount: this.order?.CustomerAccountNumber,
          customerName: this.order?.CustomerName,
          warehouse: this.order?.ShippingWarehouseId,
          slipDate: new Date(),
          lines: selectedList.map(s => ({
            itemNumber: s.line.ItemNumber,
            productName: s.line.ProductName,
            quantity: s.qty,
            unit: s.line.SalesUnitSymbol,
          })),
        };
        this.slipConfirmed = true;
      },
      error: async (err) => {
        await loading.dismiss();
        this.isSubmitting = false;
        const msg = err?.error?.Message ?? err?.error?.message ?? err?.message ?? 'Shipment failed.';
        const t = await this.toastCtrl.create({ message: msg, duration: 5000, color: 'danger', position: 'bottom' });
        await t.present();
      }
    });
  }

  // ── PDF ───────────────────────────────────────────────────────

  async downloadPdf() {
    if (!this.slipPdfData || this.isPdfBusy) return;
    this.isPdfBusy = true;
    try {
      await this.pdfService.downloadPackingSlip(this.slipPdfData);
    } catch {
      const t = await this.toastCtrl.create({ message: 'Could not generate PDF. Try again.', duration: 3000, color: 'danger', position: 'bottom' });
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
      const t = await this.toastCtrl.create({ message: 'Could not share PDF. Try again.', duration: 3000, color: 'danger', position: 'bottom' });
      await t.present();
    } finally {
      this.isPdfBusy = false;
    }
  }

  goBack() { this.router.navigate(['/sales-order/list']); }
}
