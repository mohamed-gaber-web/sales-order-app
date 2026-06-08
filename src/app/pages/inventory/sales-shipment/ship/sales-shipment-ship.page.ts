import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { SalesShipmentService } from '../../../../core/services/sales-shipment.service';
import { SalesShipmentHeader } from '../../../../models/inventory.model';
import { PdfService, PackingSlipPdfData } from '../../../../core/services/pdf.service';

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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private shipmentService: SalesShipmentService,
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
  }

  async submitShipment() {
    if (this.form.invalid || this.isSubmitting) return;
    const { packingSlipId, dataAreaId } = this.form.value as { packingSlipId: string; dataAreaId: string };

    const loading = await this.loadingCtrl.create({ message: 'Creating packing slip...', spinner: 'crescent' });
    await loading.present();
    this.isSubmitting = true;

    this.shipmentService.createPackingSlip({
      _request: {
        DataAreaId: dataAreaId.toUpperCase(),
        SalesOrderId: this.soNumber,
        PackingSlipId: packingSlipId.trim(),
        salesLineNum: [],
        packingSlipQty: [],
      }
    }).subscribe({
      next: async () => {
        await loading.dismiss();
        this.isSubmitting = false;
        this.slipPdfData = {
          salesOrderId: this.soNumber,
          packingSlipId: packingSlipId.trim(),
          dataAreaId: dataAreaId,
          customerAccount: this.order?.CustomerAccountNumber,
          customerName: this.order?.CustomerName,
          warehouse: this.order?.ShippingWarehouseId,
          slipDate: new Date(),
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
