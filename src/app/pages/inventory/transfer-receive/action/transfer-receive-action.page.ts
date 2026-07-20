import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LoadingController, ToastController } from '@ionic/angular';
import { TransferShipmentService } from '../../../../core/services/transfer-shipment.service';
import { TransferOrderHeader, TransferOrderLine } from '../../../../models/transfer-order.model';

interface ReceiveLineEntry {
  line: TransferOrderLine;
  receiveQty: number;
  remainQty: number;
}

@Component({
  selector: 'app-transfer-receive-action',
  templateUrl: './transfer-receive-action.page.html',
  styleUrls: ['./transfer-receive-action.page.scss'],
  standalone: false,
})
export class TransferReceiveActionPage implements OnInit {
  toNumber = '';
  dataAreaId = 'usmf';
  header: TransferOrderHeader | null = null;
  lineEntries: ReceiveLineEntry[] = [];

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
          .filter(l => this.getRemainReceive(l) > 0)
          .map(l => ({
            line: l,
            receiveQty: this.getRemainReceive(l),
            remainQty: this.getRemainReceive(l),
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

  private getRemainReceive(line: TransferOrderLine): number {
    // Field name from D365 API: RemainReceivePhysical (may be mapped to RemainingReceivedQuantity in model)
    const raw = (line as unknown as Record<string, unknown>)['RemainReceivePhysical'];
    if (raw !== undefined && raw !== null) return Number(raw);
    return line.RemainingReceivedQuantity ?? line.TransferQuantity ?? 0;
  }

  setMaxQty(entry: ReceiveLineEntry) {
    entry.receiveQty = entry.remainQty;
  }

  get isFormValid(): boolean {
    return (
      this.lineEntries.length > 0 &&
      this.lineEntries.every(e => e.receiveQty > 0 && e.receiveQty <= e.remainQty)
    );
  }

  async submitReceive() {
    if (!this.isFormValid || this.isSubmitting) return;

    const loading = await this.loadingCtrl.create({
      message: 'Receiving transfer order...',
      spinner: 'crescent',
    });
    await loading.present();
    this.isSubmitting = true;

    this.transferShipmentService.receiveTransferOrder({
      _request: {
        DataAreaId: this.dataAreaId.toUpperCase(),
        transferOrderID: this.toNumber,
        transferLineNum: this.lineEntries.map(e => e.line.LineNumber),
        transferQTY: this.lineEntries.map(e => e.receiveQty),
      },
    }).subscribe({
      next: async (res) => {
        await loading.dismiss();
        this.isSubmitting = false;
        if (res.Success) {
          const toast = await this.toastCtrl.create({
            message: `Transfer order ${this.toNumber} received successfully.`,
            buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'success', position: 'bottom',
          });
          await toast.present();
          this.router.navigate(['/inventory/transfer-receive']);
        } else {
          const toast = await this.toastCtrl.create({
            message: res.ErrorMessage || res.DebugMessage || 'Receive failed. Try again.',
            buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
          });
          await toast.present();
        }
      },
      error: async (err: unknown) => {
        await loading.dismiss();
        this.isSubmitting = false;
        const e = err as { error?: { Message?: string; message?: string }; message?: string };
        const msg = e?.error?.Message ?? e?.error?.message ?? e?.message ?? 'Receive failed. Check your connection and try again.';
        const toast = await this.toastCtrl.create({
          message: msg, buttons: [{ text: 'Dismiss', role: 'cancel' }], color: 'danger', position: 'bottom',
        });
        await toast.present();
      },
    });
  }

  goBack() {
    this.router.navigate(['/inventory/transfer-receive']);
  }
}
