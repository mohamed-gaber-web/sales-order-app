import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs/operators';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, LoadingController, ToastController } from '@ionic/angular';
import {
  SalesOrderLineService,
  SalesOrderLineResponse,
} from '../../../core/services/sales-order-line.service';
import { SalesOrderService } from '../../../core/services/sales-order.service';

@Component({
  selector: 'app-sales-order-line-detail',
  templateUrl: './sales-order-line-detail.page.html',
  styleUrls: ['./sales-order-line-detail.page.scss'],
  standalone: false,
})
export class SalesOrderLineDetailPage implements OnInit {
  salesOrderNumber = '';
  allLines: SalesOrderLineResponse[] = [];
  lines: SalesOrderLineResponse[] = [];
  searchTerm = '';
  isLoading = false;

  isSubmittingSlip = false;
  linePhotos = new Map<string, string>();
  selectedLines = new Map<string, { line: SalesOrderLineResponse; lineNum: number }>();
  private pendingPhotoKey = '';
  private destroyRef = inject(DestroyRef);

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);
  private loadingCtrl = inject(LoadingController);
  private orderLineService = inject(SalesOrderLineService);
  private salesOrderService = inject(SalesOrderService);

  ngOnInit() {
    this.salesOrderNumber =
      this.route.snapshot.paramMap.get('salesOrderNumber') ?? '';
  }

  ionViewWillEnter() {
    this.loadLines();
  }

  loadLines() {
    if (!this.salesOrderNumber) return;
    this.isLoading = true;
    this.selectedLines.clear();
    this.orderLineService.getOrderLines(this.salesOrderNumber).subscribe({
      next: (res) => {
        this.allLines = res.value;
        this.filterLines();
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        const toast = await this.toastCtrl.create({
          message: 'Failed to load order lines.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  onSearchChange() {
    this.filterLines();
  }

  private filterLines() {
    if (!this.searchTerm.trim()) {
      this.lines = [...this.allLines];
      return;
    }
    const term = this.searchTerm.toLowerCase();
    this.lines = this.allLines.filter((line) =>
      (line.ItemNumber ?? '').toLowerCase().includes(term) ||
      (line.ProductName ?? '').toLowerCase().includes(term) ||
      (line.ShippingSiteId ?? '').toLowerCase().includes(term) ||
      (line.ShippingWarehouseId ?? '').toLowerCase().includes(term) ||
      (line.ProductConfigurationId ?? '').toLowerCase().includes(term) ||
      (line.ProductSizeId ?? '').toLowerCase().includes(term) ||
      (line.ProductColorId ?? '').toLowerCase().includes(term) ||
      (line.ProductStyleId ?? '').toLowerCase().includes(term)
    );
  }

  async createPickingSlip(line: SalesOrderLineResponse, lineIndex: number) {
    const maxQty = line.OrderedSalesQuantity ?? 0;

    const alert = await this.alertCtrl.create({
      header: 'Create Packing Slip',
      subHeader: `${line.ItemNumber} — Line ${line.LineNumber ?? lineIndex + 1}`,
      inputs: [
        {
          name: 'packingSlipId',
          type: 'text',
          placeholder: 'Packing Slip ID (optional)',
        },
        {
          name: 'qty',
          type: 'number',
          placeholder: 'Quantity',
          value: maxQty,
          min: 0.001,
        },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Create',
          handler: (data) => {
            const qty = Number(data.qty);
            if (!qty || qty <= 0) return false;
            this.submitPickingSlip(line, lineIndex, data.packingSlipId ?? '', qty);
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async submitPickingSlip(
    line: SalesOrderLineResponse,
    lineIndex: number,
    packingSlipId: string,
    qty: number,
  ) {
    if (this.isSubmittingSlip) return;
    this.isSubmittingSlip = true;

    const loading = await this.loadingCtrl.create({
      message: 'Creating packing slip...',
      spinner: 'crescent',
    });
    await loading.present();

    const dataAreaId = (line.dataAreaId ?? 'usmf').toUpperCase();
    const lineNum = line.LineNumber ?? lineIndex + 1;

    this.salesOrderService.createPackingSlip({
      _request: {
        DataAreaId: dataAreaId,
        SalesOrderID: this.salesOrderNumber,
        packingSlipId,
        salesLineNum: [lineNum],
        packingSlipQty: [qty],
      },
    }).subscribe({
      next: async (res) => {
        await loading.dismiss();
        this.isSubmittingSlip = false;
        if (res.Success) {
          const toast = await this.toastCtrl.create({
            message: `Packing slip created for line ${lineNum}.`,
            buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'success', position: 'bottom',
          });
          await toast.present();
          this.loadLines();
        } else {
          const toast = await this.toastCtrl.create({
            message: res.ErrorMessage || res.DebugMessage || 'Failed to create packing slip.',
            buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
          });
          await toast.present();
        }
      },
      error: async (err: unknown) => {
        await loading.dismiss();
        this.isSubmittingSlip = false;
        const e = err as { error?: { Message?: string; message?: string }; message?: string };
        const msg = e?.error?.Message ?? e?.error?.message ?? e?.message ?? 'Failed to create packing slip.';
        const toast = await this.toastCtrl.create({
          message: msg, buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  lineKey(line: SalesOrderLineResponse, i: number): string {
    return String(line.LineNumber ?? i);
  }

  toggleLine(line: SalesOrderLineResponse, i: number) {
    const key = this.lineKey(line, i);
    if (this.selectedLines.has(key)) {
      this.selectedLines.delete(key);
    } else {
      this.selectedLines.set(key, { line, lineNum: line.LineNumber ?? i + 1 });
    }
  }

  clearSelection() {
    this.selectedLines.clear();
  }

  async createMultiPackingSlip() {
    if (this.selectedLines.size === 0 || this.isSubmittingSlip) return;

    const selected = Array.from(this.selectedLines.values());
    const missingQty = selected.filter((s) => !(Number(s.line.OrderedSalesQuantity) > 0));
    if (missingQty.length > 0) {
      const toast = await this.toastCtrl.create({
        message: `${missingQty[0].line.ItemNumber} has no quantity. Deselect it or fix the line first.`,
        buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
      });
      await toast.present();
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Create Packing Slip',
      subHeader: `${selected.length} lines selected`,
      inputs: [
        {
          name: 'packingSlipId',
          type: 'text',
          placeholder: 'Packing Slip ID (optional)',
        },
      ],
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Create',
          handler: (data) => {
            this.submitMultiPackingSlip(selected, data.packingSlipId ?? '');
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  private async submitMultiPackingSlip(
    selected: { line: SalesOrderLineResponse; lineNum: number }[],
    packingSlipId: string,
  ) {
    if (this.isSubmittingSlip) return;
    this.isSubmittingSlip = true;

    const loading = await this.loadingCtrl.create({
      message: `Creating packing slip for ${selected.length} lines...`,
      spinner: 'crescent',
    });
    await loading.present();

    const dataAreaId = (selected[0].line.dataAreaId ?? 'usmf').toUpperCase();

    this.salesOrderService.createPackingSlip({
      _request: {
        DataAreaId: dataAreaId,
        SalesOrderID: this.salesOrderNumber,
        packingSlipId,
        salesLineNum: selected.map((s) => s.lineNum),
        packingSlipQty: selected.map((s) => Number(s.line.OrderedSalesQuantity)),
      },
    })
      .pipe(
        finalize(() => {
          loading.dismiss();
          this.isSubmittingSlip = false;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: async (res) => {
          if (res.Success) {
            const toast = await this.toastCtrl.create({
              message: `Packing slip created for ${selected.length} lines.`,
              buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'success', position: 'bottom',
            });
            await toast.present();
            this.clearSelection();
            this.loadLines();
          } else {
            const toast = await this.toastCtrl.create({
              message: res.ErrorMessage || res.DebugMessage || 'Failed to create packing slip.',
              buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
            });
            await toast.present();
          }
        },
        error: async (err: unknown) => {
          const e = err as { error?: { Message?: string; message?: string }; message?: string };
          const msg = e?.error?.Message ?? e?.error?.message ?? e?.message ?? 'Failed to create packing slip.';
          const toast = await this.toastCtrl.create({
            message: msg, buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
          });
          await toast.present();
        },
      });
  }

  takePhoto(line: SalesOrderLineResponse, i: number) {
    this.pendingPhotoKey = this.lineKey(line, i);
    (document.getElementById('gp-photo-input') as HTMLInputElement)?.click();
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      if (result) this.linePhotos.set(this.pendingPhotoKey, result);
    };
    reader.readAsDataURL(file);
    input.value = '';
  }

  postPackingSlip() {
    this.router.navigate(
      ['/inventory/sales-shipment/ship', this.salesOrderNumber],
      { state: { returnUrl: '/sales-order/list' } }
    );
  }

  addLine() {
    this.router.navigate([
      '/sales-order-line/create',
      this.salesOrderNumber,
    ]);
  }

  goBack() {
    this.router.navigate(['/sales-order/list']);
  }

  formatCurrency(value?: number): string {
    if (value == null) return '—';
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }
}
