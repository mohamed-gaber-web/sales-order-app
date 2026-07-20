import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { TransferShipmentService } from '../../../../core/services/transfer-shipment.service';
import { TransferOrderHeader, TransferOrderLine } from '../../../../models/transfer-order.model';

interface ShipLineEntry {
  line: TransferOrderLine;
  shipQty: number;
  remainQty: number;
}

@Component({
  selector: 'app-transfer-ship-action',
  templateUrl: './transfer-ship-action.page.html',
  styleUrls: ['./transfer-ship-action.page.scss'],
  standalone: false,
})
export class TransferShipActionPage implements OnInit {
  toNumber = '';
  dataAreaId = 'usmf';
  header: TransferOrderHeader | null = null;
  lineEntries: ShipLineEntry[] = [];

  isLoading = false;
  isSubmitting = false;
  loadError = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private loadingCtrl: LoadingController,
    private toastCtrl: ToastController,
    private transferShipmentService: TransferShipmentService,
  ) {}

  ngOnInit() {
    this.toNumber = this.route.snapshot.paramMap.get('toNumber') ?? '';
    this.loadOrderWithLines();
  }

  loadOrderWithLines() {
    this.isLoading = true;
    this.loadError = false;
    this.lineEntries = [];
    this.header = null;

    this.transferShipmentService.getOrderWithLines(this.toNumber, this.dataAreaId).subscribe({
      next: ({ header, lines }) => {
        this.header = header;
        this.dataAreaId = header.dataAreaId ?? this.dataAreaId;
        this.lineEntries = lines
          .filter(l => this.getRemainShip(l) > 0)
          .map(l => ({
            line: l,
            shipQty: this.getRemainShip(l),
            remainQty: this.getRemainShip(l),
          }));
        this.isLoading = false;
      },
      error: async () => {
        this.isLoading = false;
        this.loadError = true;
        const toast = await this.toastCtrl.create({
          message: 'Could not load transfer order. Check your connection.',
          buttons: [{ text: 'Dismiss', role: 'cancel' }],
          color: 'danger',
          position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  private getRemainShip(line: TransferOrderLine): number {
    // Field name from D365 API: RemainShipPhysical (may be mapped to RemainingShippedQuantity in model)
    const raw = (line as unknown as Record<string, unknown>)['RemainShipPhysical'];
    if (raw !== undefined && raw !== null) return Number(raw);
    return line.RemainingShippedQuantity ?? line.TransferQuantity ?? 0;
  }

  setMaxQty(entry: ShipLineEntry) {
    entry.shipQty = entry.remainQty;
  }

  get isFormValid(): boolean {
    return (
      this.lineEntries.length > 0 &&
      this.lineEntries.every(e => e.shipQty > 0 && e.shipQty <= e.remainQty)
    );
  }

  async submitShipment() {
    if (!this.isFormValid || this.isSubmitting) return;

    const loading = await this.loadingCtrl.create({
      message: 'Shipping transfer order...',
      spinner: 'crescent',
    });
    await loading.present();
    this.isSubmitting = true;

    this.transferShipmentService.shipTransferOrder({
      _request: {
        DataAreaId: this.dataAreaId.toUpperCase(),
        transferOrderID: this.toNumber,
        transferLineNum: this.lineEntries.map(e => e.line.LineNumber),
        transferQTY: this.lineEntries.map(e => e.shipQty),
      },
    }).subscribe({
      next: async (res) => {
        await loading.dismiss();
        this.isSubmitting = false;
        if (res.Success) {
          const toast = await this.toastCtrl.create({
            message: `Transfer order ${this.toNumber} shipped successfully.`,
            buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'success', position: 'bottom',
          });
          await toast.present();
          this.router.navigate(['/inventory/transfer-ship']);
        } else {
          const toast = await this.toastCtrl.create({
            message: res.ErrorMessage || res.DebugMessage || 'Shipment failed. Try again.',
            buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
          });
          await toast.present();
        }
      },
      error: async (err: unknown) => {
        await loading.dismiss();
        this.isSubmitting = false;
        const e = err as { error?: { Message?: string; message?: string }; message?: string };
        const msg = e?.error?.Message ?? e?.error?.message ?? e?.message ?? 'Shipment failed. Check your connection and try again.';
        const toast = await this.toastCtrl.create({
          message: msg, buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  goBack() {
    this.router.navigate(['/inventory/transfer-ship']);
  }
}
