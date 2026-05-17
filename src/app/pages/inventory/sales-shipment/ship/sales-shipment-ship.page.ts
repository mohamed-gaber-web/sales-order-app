import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { SalesShipmentService } from '../../../../core/services/sales-shipment.service';

@Component({
  selector: 'app-sales-shipment-ship',
  templateUrl: './sales-shipment-ship.page.html',
  styleUrls: ['./sales-shipment-ship.page.scss'],
  standalone: false,
})
export class SalesShipmentShipPage implements OnInit {
  soNumber = '';
  form!: FormGroup;
  isSubmitting = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private shipmentService: SalesShipmentService,
  ) {}

  ngOnInit() {
    this.soNumber = this.route.snapshot.paramMap.get('soNumber') ?? '';
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
        const t = await this.toastCtrl.create({ message: `Packing slip ${packingSlipId} created.`, duration: 3000, color: 'success', position: 'bottom' });
        await t.present();
        this.router.navigate(['/inventory/sales-shipment']);
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

  goBack() { this.router.navigate(['/inventory/sales-shipment']); }
}
